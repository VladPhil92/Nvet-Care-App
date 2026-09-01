import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  Prisma,
  TransactionStatus,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PetsService } from "../pets/pets.service";

const DAY_MS = 86_400_000;
const PREVENTIVE_WINDOW_DAYS = 60;
const APPOINTMENT_LOOKBACK_DAYS = 90;

type NotificationAudience = "CLIENT" | "VET";

type NotificationSeed = {
  dedupeKey: string;
  type: string;
  category: "APPOINTMENT" | "PAYMENT" | "PREVENTIVE";
  title: string;
  message: string;
  actionPath: string;
  occurredAt: Date;
  metadata: Prisma.InputJsonValue;
};

type TransactionForNotification = {
  id: string;
  status: TransactionStatus;
  amountCop: number;
  paymentMethod: string;
  verifiedAt: Date | null;
  liquidatedAt: Date | null;
  updatedAt: Date;
};

type AppointmentForNotification = {
  id: string;
  status: AppointmentStatus;
  date: Date;
  time: string;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  inProgressAt: Date | null;
  completedAt: Date | null;
  pet: { id: string; name: string };
  transaction: TransactionForNotification | null;
};

type VetAppointmentForNotification = AppointmentForNotification & {
  client: { id: string; firstName: string | null; lastName: string | null };
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petsService: PetsService,
  ) {}

  async listForUser(userId: string, role: UserRole, rawLimit?: string) {
    const limit = this.parseLimit(rawLimit);
    const audience = this.requireInboxAudience(role);
    await this.syncDerivedNotifications(userId, audience);
    const where = this.inboxWhere(userId, audience);

    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      summary: { total, unread },
      items,
    };
  }

  async getUnreadCount(userId: string, role: UserRole) {
    const audience = this.requireInboxAudience(role);
    await this.syncDerivedNotifications(userId, audience);
    const where = this.inboxWhere(userId, audience);
    const unread = await this.prisma.notification.count({
      where: { ...where, readAt: null },
    });
    return { unread };
  }

  async markRead(userId: string, role: UserRole, notificationId: string) {
    const audience = this.requireInboxAudience(role);
    const where = this.inboxWhere(userId, audience);
    const notification = await this.prisma.notification.findFirst({
      where: { ...where, id: notificationId },
    });
    if (!notification) {
      throw new NotFoundException("Notificación no encontrada");
    }
    if (notification.readAt) return notification;

    return this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string, role: UserRole) {
    const audience = this.requireInboxAudience(role);
    await this.syncDerivedNotifications(userId, audience);
    const now = new Date();
    const where = this.inboxWhere(userId, audience);
    const result = await this.prisma.notification.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: now },
    });
    return { updated: result.count, readAt: now.toISOString() };
  }

  private parseLimit(rawLimit?: string): number {
    if (rawLimit === undefined) return 50;
    const limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException("limit debe ser un entero entre 1 y 100");
    }
    return limit;
  }

  private requireInboxAudience(role: UserRole): NotificationAudience {
    if (role === UserRole.CLIENT) return "CLIENT";
    if (role === UserRole.VET) return "VET";
    throw new ForbiddenException(
      "El centro de notificaciones está disponible solo para clientes y veterinarios",
    );
  }

  private inboxWhere(
    userId: string,
    audience: NotificationAudience,
  ): Prisma.NotificationWhereInput {
    if (audience === "VET") {
      return {
        userId,
        dedupeKey: { contains: ":VET:" },
      };
    }

    return {
      userId,
      NOT: { dedupeKey: { contains: ":VET:" } },
    };
  }

  private async syncDerivedNotifications(
    userId: string,
    audience: NotificationAudience,
  ) {
    const materializedAt = new Date();
    const recentCutoff = new Date(
      materializedAt.getTime() - APPOINTMENT_LOOKBACK_DAYS * DAY_MS,
    );
    const activeStatuses: AppointmentStatus[] = [
      AppointmentStatus.PENDING,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.IN_PROGRESS,
      AppointmentStatus.DISPUTED,
    ];

    let seeds: NotificationSeed[] = [];

    if (audience === "VET") {
      const vetProfile = await this.prisma.vetProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!vetProfile) return;

      const appointments = await this.prisma.appointment.findMany({
        where: {
          vetId: vetProfile.id,
          OR: [
            { status: { in: activeStatuses } },
            { updatedAt: { gte: recentCutoff } },
          ],
        },
        select: {
          id: true,
          status: true,
          date: true,
          time: true,
          createdAt: true,
          updatedAt: true,
          confirmedAt: true,
          inProgressAt: true,
          completedAt: true,
          pet: { select: { id: true, name: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
          transaction: {
            select: {
              id: true,
              status: true,
              amountCop: true,
              paymentMethod: true,
              verifiedAt: true,
              liquidatedAt: true,
              updatedAt: true,
            },
          },
        },
      });

      seeds = appointments.flatMap((appointment) =>
        this.vetAppointmentSeeds(appointment),
      );
    } else {
      const [appointments, preventiveAgenda] = await Promise.all([
        this.prisma.appointment.findMany({
          where: {
            clientId: userId,
            OR: [
              { status: { in: activeStatuses } },
              { updatedAt: { gte: recentCutoff } },
            ],
          },
          select: {
            id: true,
            status: true,
            date: true,
            time: true,
            createdAt: true,
            updatedAt: true,
            confirmedAt: true,
            inProgressAt: true,
            completedAt: true,
            pet: { select: { id: true, name: true } },
            transaction: {
              select: {
                id: true,
                status: true,
                amountCop: true,
                paymentMethod: true,
                verifiedAt: true,
                liquidatedAt: true,
                updatedAt: true,
              },
            },
          },
        }),
        this.petsService.getPreventiveAgenda(userId, PREVENTIVE_WINDOW_DAYS),
      ]);

      seeds = appointments.flatMap((appointment) =>
        this.clientAppointmentSeeds(appointment),
      );

      for (const item of preventiveAgenda.items) {
        if (item.status === "UPCOMING") continue;
        const dueAt = new Date(`${item.dueAt}T00:00:00.000Z`);
        if (Number.isNaN(dueAt.getTime())) continue;

        const overdue = item.status === "OVERDUE";
        const message = overdue
          ? item.daysUntilDue === 0
            ? `${item.petName}: este control preventivo vence hoy.`
            : `${item.petName}: este control preventivo está vencido hace ${Math.abs(item.daysUntilDue)} día(s).`
          : `${item.petName}: este control preventivo vence en ${item.daysUntilDue} día(s).`;

        seeds.push({
          dedupeKey: `preventive:${item.source}:${item.id}:${item.dueAt}:${item.status}`,
          type: overdue ? "PREVENTIVE_OVERDUE" : "PREVENTIVE_DUE_SOON",
          category: "PREVENTIVE",
          title: item.title,
          message,
          actionPath: `/nvetcareapp/dashboard/mascotas/${item.petId}/salud`,
          occurredAt: materializedAt,
          metadata: {
            source: item.source,
            preventiveItemId: item.id,
            petId: item.petId,
            dueAt: item.dueAt,
            status: item.status,
            daysUntilDue: item.daysUntilDue,
            audience: "CLIENT",
          },
        });
      }
    }

    if (seeds.length === 0) return;

    await this.prisma.notification.createMany({
      data: seeds.map((seed) => ({
        userId,
        dedupeKey: seed.dedupeKey,
        type: seed.type,
        category: seed.category,
        title: seed.title,
        message: seed.message,
        actionPath: seed.actionPath,
        occurredAt: seed.occurredAt,
        metadata: seed.metadata,
      })),
      skipDuplicates: true,
    });
  }

  private clientAppointmentSeeds(
    appointment: AppointmentForNotification,
  ): NotificationSeed[] {
    const current = this.clientAppointmentStatusSeed(appointment);
    const seeds = current ? [current] : [];
    seeds.push(...this.paymentSeeds(appointment, "CLIENT"));

    if (appointment.status === AppointmentStatus.CONFIRMED) {
      const reminder = this.appointmentReminderSeed(appointment, "CLIENT");
      if (reminder) seeds.push(reminder);
    }

    return seeds;
  }

  private vetAppointmentSeeds(
    appointment: VetAppointmentForNotification,
  ): NotificationSeed[] {
    const current = this.vetAppointmentStatusSeed(appointment);
    const seeds = current ? [current] : [];
    seeds.push(...this.paymentSeeds(appointment, "VET"));

    if (appointment.status === AppointmentStatus.CONFIRMED) {
      const reminder = this.appointmentReminderSeed(appointment, "VET");
      if (reminder) seeds.push(reminder);
    }

    return seeds;
  }

  private appointmentReminderSeed(
    appointment: AppointmentForNotification,
    audience: NotificationAudience,
  ): NotificationSeed | null {
    const today = this.utcDateOnly(new Date());
    const appointmentDay = this.utcDateOnly(appointment.date);
    const daysUntil = Math.round(
      (appointmentDay.getTime() - today.getTime()) / DAY_MS,
    );
    if (daysUntil < 0 || daysUntil > 1) return null;

    const dateKey = appointmentDay.toISOString().slice(0, 10);
    return {
      dedupeKey:
        audience === "CLIENT"
          ? `appointment:${appointment.id}:REMINDER:${dateKey}`
          : `appointment:${appointment.id}:VET:REMINDER:${dateKey}`,
      type: "APPOINTMENT_REMINDER",
      category: "APPOINTMENT",
      title:
        daysUntil === 0
          ? "Cita programada para hoy"
          : "Cita programada para mañana",
      message: `${appointment.pet.name} tiene una atención confirmada a las ${appointment.time}.`,
      actionPath:
        audience === "VET"
          ? "/nvetcareapp/dashboard/veterinario"
          : "/nvetcareapp/dashboard/citas",
      occurredAt: today,
      metadata: {
        appointmentId: appointment.id,
        petId: appointment.pet.id,
        appointmentDate: dateKey,
        time: appointment.time,
        audience,
      },
    };
  }

  private clientAppointmentStatusSeed(
    appointment: AppointmentForNotification,
  ): NotificationSeed | null {
    const base = {
      dedupeKey: `appointment:${appointment.id}:${appointment.status}`,
      category: "APPOINTMENT" as const,
      actionPath: "/nvetcareapp/dashboard/citas",
      metadata: {
        appointmentId: appointment.id,
        petId: appointment.pet.id,
        status: appointment.status,
        audience: "CLIENT",
      } satisfies Prisma.InputJsonValue,
    };

    switch (appointment.status) {
      case AppointmentStatus.PENDING:
        return {
          ...base,
          type: "APPOINTMENT_REQUESTED",
          title: "Solicitud de atención creada",
          message: `La solicitud de ${appointment.pet.name} está pendiente de confirmación.`,
          occurredAt: appointment.createdAt,
        };
      case AppointmentStatus.CONFIRMED:
        return {
          ...base,
          type: "APPOINTMENT_CONFIRMED",
          title: "Cita confirmada",
          message: `La atención de ${appointment.pet.name} fue confirmada.`,
          occurredAt: appointment.confirmedAt ?? appointment.updatedAt,
        };
      case AppointmentStatus.IN_PROGRESS:
        return {
          ...base,
          type: "APPOINTMENT_IN_PROGRESS",
          title: "Atención en curso",
          message: `La atención de ${appointment.pet.name} está en curso.`,
          occurredAt: appointment.inProgressAt ?? appointment.updatedAt,
        };
      case AppointmentStatus.COMPLETED:
        return {
          ...base,
          type: "APPOINTMENT_COMPLETED",
          title: "Atención completada",
          message: `La atención de ${appointment.pet.name} finalizó. Revisa su historial clínico.`,
          actionPath: "/nvetcareapp/dashboard/historial",
          occurredAt: appointment.completedAt ?? appointment.updatedAt,
        };
      case AppointmentStatus.CANCELLED:
        return {
          ...base,
          type: "APPOINTMENT_CANCELLED",
          title: "Cita cancelada",
          message: `La atención de ${appointment.pet.name} fue cancelada.`,
          occurredAt: appointment.updatedAt,
        };
      case AppointmentStatus.DISPUTED:
        return {
          ...base,
          type: "APPOINTMENT_DISPUTED",
          title: "Atención en revisión",
          message: `La atención de ${appointment.pet.name} está en revisión.`,
          occurredAt: appointment.updatedAt,
        };
      default:
        return null;
    }
  }

  private vetAppointmentStatusSeed(
    appointment: VetAppointmentForNotification,
  ): NotificationSeed | null {
    const clientName =
      [appointment.client.firstName, appointment.client.lastName]
        .filter(Boolean)
        .join(" ") || "Un usuario";
    const base = {
      dedupeKey: `appointment:${appointment.id}:VET:${appointment.status}`,
      category: "APPOINTMENT" as const,
      actionPath: "/nvetcareapp/dashboard/veterinario",
      metadata: {
        appointmentId: appointment.id,
        petId: appointment.pet.id,
        clientId: appointment.client.id,
        status: appointment.status,
        audience: "VET",
      } satisfies Prisma.InputJsonValue,
    };

    switch (appointment.status) {
      case AppointmentStatus.PENDING:
        return {
          ...base,
          type: "VET_APPOINTMENT_REQUESTED",
          title: "Nueva solicitud de atención",
          message: `${clientName} solicitó atención para ${appointment.pet.name}.`,
          occurredAt: appointment.createdAt,
        };
      case AppointmentStatus.CONFIRMED:
        return {
          ...base,
          type: "VET_APPOINTMENT_CONFIRMED",
          title: "Cita confirmada",
          message: `La atención de ${appointment.pet.name} quedó confirmada para tu agenda.`,
          occurredAt: appointment.confirmedAt ?? appointment.updatedAt,
        };
      case AppointmentStatus.IN_PROGRESS:
        return {
          ...base,
          type: "VET_APPOINTMENT_IN_PROGRESS",
          title: "Atención en curso",
          message: `La atención de ${appointment.pet.name} está registrada como en curso.`,
          occurredAt: appointment.inProgressAt ?? appointment.updatedAt,
        };
      case AppointmentStatus.COMPLETED:
        return {
          ...base,
          type: "VET_APPOINTMENT_COMPLETED",
          title: "Atención completada",
          message: `La atención de ${appointment.pet.name} quedó completada.`,
          occurredAt: appointment.completedAt ?? appointment.updatedAt,
        };
      case AppointmentStatus.CANCELLED:
        return {
          ...base,
          type: "VET_APPOINTMENT_CANCELLED",
          title: "Cita cancelada",
          message: `La atención de ${appointment.pet.name} fue cancelada.`,
          occurredAt: appointment.updatedAt,
        };
      case AppointmentStatus.DISPUTED:
        return {
          ...base,
          type: "VET_APPOINTMENT_DISPUTED",
          title: "Atención en revisión",
          message: `La atención de ${appointment.pet.name} entró en revisión.`,
          occurredAt: appointment.updatedAt,
        };
      default:
        return null;
    }
  }

  private paymentSeeds(
    appointment: AppointmentForNotification,
    audience: NotificationAudience,
  ): NotificationSeed[] {
    const transaction = appointment.transaction;
    if (!transaction || transaction.status === TransactionStatus.PENDING) {
      return [];
    }

    const seeds: NotificationSeed[] = [];

    if (transaction.verifiedAt) {
      const confirmed = this.paymentStatusSeed(
        appointment,
        transaction,
        audience,
        TransactionStatus.CONFIRMED,
        transaction.verifiedAt,
      );
      if (confirmed) seeds.push(confirmed);
    }

    if (transaction.liquidatedAt) {
      const liquidated = this.paymentStatusSeed(
        appointment,
        transaction,
        audience,
        TransactionStatus.LIQUIDATED,
        transaction.liquidatedAt,
      );
      if (liquidated) seeds.push(liquidated);
    }

    const currentAlreadyReconstructed =
      (transaction.status === TransactionStatus.CONFIRMED &&
        Boolean(transaction.verifiedAt)) ||
      (transaction.status === TransactionStatus.LIQUIDATED &&
        Boolean(transaction.liquidatedAt));

    if (!currentAlreadyReconstructed) {
      const current = this.paymentStatusSeed(
        appointment,
        transaction,
        audience,
        transaction.status,
        transaction.updatedAt,
      );
      if (current) seeds.push(current);
    }

    return seeds;
  }

  private paymentStatusSeed(
    appointment: AppointmentForNotification,
    transaction: TransactionForNotification,
    audience: NotificationAudience,
    status: TransactionStatus,
    occurredAt: Date,
  ): NotificationSeed | null {
    const base = this.paymentSeedBase(
      appointment,
      transaction,
      audience,
      status,
    );

    if (audience === "CLIENT") {
      switch (status) {
        case TransactionStatus.VERIFYING:
          return {
            ...base,
            type: "PAYMENT_VERIFYING",
            title: "Pago en verificación",
            message: `El pago de la atención de ${appointment.pet.name} está siendo verificado.`,
            occurredAt,
          };
        case TransactionStatus.CONFIRMED:
          return {
            ...base,
            type: "PAYMENT_CONFIRMED",
            title: "Pago confirmado",
            message: `Confirmamos el pago de ${this.formatCop(transaction.amountCop)} para la atención de ${appointment.pet.name}.`,
            occurredAt,
          };
        case TransactionStatus.LIQUIDATED:
          return {
            ...base,
            type: "PAYMENT_LIQUIDATED",
            title: "Pago completado",
            message: `El pago de ${this.formatCop(transaction.amountCop)} quedó liquidado correctamente.`,
            occurredAt,
          };
        case TransactionStatus.DISPUTED:
          return {
            ...base,
            type: "PAYMENT_DISPUTED",
            title: "Pago en revisión",
            message: `El pago asociado a la atención de ${appointment.pet.name} está en revisión.`,
            occurredAt,
          };
        case TransactionStatus.FAILED:
          return {
            ...base,
            type: "PAYMENT_FAILED",
            title: "Pago no procesado",
            message: `No fue posible procesar el pago de la atención de ${appointment.pet.name}.`,
            occurredAt,
          };
        default:
          return null;
      }
    }

    switch (status) {
      case TransactionStatus.VERIFYING:
        return {
          ...base,
          type: "VET_PAYMENT_VERIFYING",
          title: "Pago en verificación",
          message: `El pago de la atención de ${appointment.pet.name} está siendo verificado.`,
          occurredAt,
        };
      case TransactionStatus.CONFIRMED:
        return {
          ...base,
          type: "VET_PAYMENT_CONFIRMED",
          title: "Pago confirmado",
          message: `El pago de ${this.formatCop(transaction.amountCop)} para ${appointment.pet.name} fue confirmado.`,
          occurredAt,
        };
      case TransactionStatus.LIQUIDATED:
        return {
          ...base,
          type: "VET_PAYOUT_LIQUIDATED",
          title: "Ingreso liquidado",
          message: `La liquidación de ${this.formatCop(transaction.amountCop)} asociada a ${appointment.pet.name} quedó registrada.`,
          occurredAt,
        };
      case TransactionStatus.DISPUTED:
        return {
          ...base,
          type: "VET_PAYMENT_DISPUTED",
          title: "Pago en revisión",
          message: `El pago asociado a la atención de ${appointment.pet.name} entró en revisión.`,
          occurredAt,
        };
      case TransactionStatus.FAILED:
        return {
          ...base,
          type: "VET_PAYMENT_FAILED",
          title: "Pago no procesado",
          message: `El pago asociado a la atención de ${appointment.pet.name} no pudo procesarse.`,
          occurredAt,
        };
      default:
        return null;
    }
  }

  private paymentSeedBase(
    appointment: AppointmentForNotification,
    transaction: TransactionForNotification,
    audience: NotificationAudience,
    status: TransactionStatus,
  ) {
    return {
      dedupeKey: `transaction:${transaction.id}:${audience}:${status}`,
      category: "PAYMENT" as const,
      actionPath:
        audience === "VET"
          ? "/nvetcareapp/dashboard/veterinario"
          : "/nvetcareapp/dashboard/citas",
      metadata: {
        appointmentId: appointment.id,
        petId: appointment.pet.id,
        transactionId: transaction.id,
        status,
        amountCop: transaction.amountCop,
        paymentMethod: transaction.paymentMethod,
        audience,
      } satisfies Prisma.InputJsonValue,
    };
  }

  private formatCop(value: number): string {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(value);
  }

  private utcDateOnly(value: Date): Date {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
}
