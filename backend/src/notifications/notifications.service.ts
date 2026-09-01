import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  Prisma,
  TransactionStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PetsService } from "../pets/pets.service";

const DAY_MS = 86_400_000;
const PREVENTIVE_WINDOW_DAYS = 60;
const APPOINTMENT_LOOKBACK_DAYS = 90;

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

  async listForUser(userId: string, rawLimit?: string) {
    const limit = this.parseLimit(rawLimit);
    await this.syncDerivedNotifications(userId);

    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      summary: { total, unread },
      items,
    };
  }

  async getUnreadCount(userId: string) {
    await this.syncDerivedNotifications(userId);
    const unread = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { unread };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
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

  async markAllRead(userId: string) {
    await this.syncDerivedNotifications(userId);
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
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

  private async syncDerivedNotifications(userId: string) {
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

    const vetProfile = await this.prisma.vetProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    let seeds: NotificationSeed[];

    if (vetProfile) {
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
          },
        });
      }
    }

    if (seeds.length === 0) return;

    // Do not rewrite existing notifications during badge polling. The unique
    // userId + dedupeKey contract makes this replay-safe while skipDuplicates
    // turns repeat synchronization into a no-op at the storage layer.
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
    const payment = this.clientPaymentSeed(appointment);
    const seeds = [current, payment].filter(
      (seed): seed is NotificationSeed => seed !== null,
    );

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
    const payment = this.vetPaymentSeed(appointment);
    const seeds = [current, payment].filter(
      (seed): seed is NotificationSeed => seed !== null,
    );

    if (appointment.status === AppointmentStatus.CONFIRMED) {
      const reminder = this.appointmentReminderSeed(appointment, "VET");
      if (reminder) seeds.push(reminder);
    }

    return seeds;
  }

  private appointmentReminderSeed(
    appointment: AppointmentForNotification,
    audience: "CLIENT" | "VET",
  ): NotificationSeed | null {
    const today = this.utcDateOnly(new Date());
    const appointmentDay = this.utcDateOnly(appointment.date);
    const daysUntil = Math.round(
      (appointmentDay.getTime() - today.getTime()) / DAY_MS,
    );
    if (daysUntil < 0 || daysUntil > 1) return null;

    return {
      dedupeKey: `appointment:${appointment.id}:${audience}:REMINDER:${appointmentDay.toISOString().slice(0, 10)}`,
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
        appointmentDate: appointmentDay.toISOString().slice(0, 10),
        time: appointment.time,
        audience,
      },
    };
  }

  private clientAppointmentStatusSeed(
    appointment: AppointmentForNotification,
  ): NotificationSeed | null {
    const base = {
      dedupeKey: `appointment:${appointment.id}:CLIENT:${appointment.status}`,
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

  private clientPaymentSeed(
    appointment: AppointmentForNotification,
  ): NotificationSeed | null {
    const transaction = appointment.transaction;
    if (!transaction || transaction.status === TransactionStatus.PENDING) {
      return null;
    }

    const base = this.paymentSeedBase(appointment, transaction, "CLIENT");
    switch (transaction.status) {
      case TransactionStatus.VERIFYING:
        return {
          ...base,
          type: "PAYMENT_VERIFYING",
          title: "Pago en verificación",
          message: `El pago de la atención de ${appointment.pet.name} está siendo verificado.`,
          occurredAt: transaction.updatedAt,
        };
      case TransactionStatus.CONFIRMED:
        return {
          ...base,
          type: "PAYMENT_CONFIRMED",
          title: "Pago confirmado",
          message: `Confirmamos el pago de ${this.formatCop(transaction.amountCop)} para la atención de ${appointment.pet.name}.`,
          occurredAt: transaction.verifiedAt ?? transaction.updatedAt,
        };
      case TransactionStatus.LIQUIDATED:
        return {
          ...base,
          type: "PAYMENT_LIQUIDATED",
          title: "Pago completado",
          message: `El pago de ${this.formatCop(transaction.amountCop)} quedó liquidado correctamente.`,
          occurredAt: transaction.liquidatedAt ?? transaction.updatedAt,
        };
      case TransactionStatus.DISPUTED:
        return {
          ...base,
          type: "PAYMENT_DISPUTED",
          title: "Pago en revisión",
          message: `El pago asociado a la atención de ${appointment.pet.name} está en revisión.`,
          occurredAt: transaction.updatedAt,
        };
      case TransactionStatus.FAILED:
        return {
          ...base,
          type: "PAYMENT_FAILED",
          title: "Pago no procesado",
          message: `No fue posible procesar el pago de la atención de ${appointment.pet.name}.`,
          occurredAt: transaction.updatedAt,
        };
      default:
        return null;
    }
  }

  private vetPaymentSeed(
    appointment: AppointmentForNotification,
  ): NotificationSeed | null {
    const transaction = appointment.transaction;
    if (!transaction || transaction.status === TransactionStatus.PENDING) {
      return null;
    }

    const base = this.paymentSeedBase(appointment, transaction, "VET");
    switch (transaction.status) {
      case TransactionStatus.VERIFYING:
        return {
          ...base,
          type: "VET_PAYMENT_VERIFYING",
          title: "Pago en verificación",
          message: `El pago de la atención de ${appointment.pet.name} está siendo verificado.`,
          occurredAt: transaction.updatedAt,
        };
      case TransactionStatus.CONFIRMED:
        return {
          ...base,
          type: "VET_PAYMENT_CONFIRMED",
          title: "Pago confirmado",
          message: `El pago de ${this.formatCop(transaction.amountCop)} para ${appointment.pet.name} fue confirmado.`,
          occurredAt: transaction.verifiedAt ?? transaction.updatedAt,
        };
      case TransactionStatus.LIQUIDATED:
        return {
          ...base,
          type: "VET_PAYOUT_LIQUIDATED",
          title: "Ingreso liquidado",
          message: `La liquidación de ${this.formatCop(transaction.amountCop)} asociada a ${appointment.pet.name} quedó registrada.`,
          occurredAt: transaction.liquidatedAt ?? transaction.updatedAt,
        };
      case TransactionStatus.DISPUTED:
        return {
          ...base,
          type: "VET_PAYMENT_DISPUTED",
          title: "Pago en revisión",
          message: `El pago asociado a la atención de ${appointment.pet.name} entró en revisión.`,
          occurredAt: transaction.updatedAt,
        };
      case TransactionStatus.FAILED:
        return {
          ...base,
          type: "VET_PAYMENT_FAILED",
          title: "Pago no procesado",
          message: `El pago asociado a la atención de ${appointment.pet.name} no pudo procesarse.`,
          occurredAt: transaction.updatedAt,
        };
      default:
        return null;
    }
  }

  private paymentSeedBase(
    appointment: AppointmentForNotification,
    transaction: TransactionForNotification,
    audience: "CLIENT" | "VET",
  ) {
    return {
      dedupeKey: `transaction:${transaction.id}:${audience}:${transaction.status}`,
      category: "PAYMENT" as const,
      actionPath:
        audience === "VET"
          ? "/nvetcareapp/dashboard/veterinario"
          : "/nvetcareapp/dashboard/citas",
      metadata: {
        appointmentId: appointment.id,
        petId: appointment.pet.id,
        transactionId: transaction.id,
        status: transaction.status,
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
