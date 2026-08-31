import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PetsService } from "../pets/pets.service";

const DAY_MS = 86_400_000;
const PREVENTIVE_WINDOW_DAYS = 60;
const APPOINTMENT_LOOKBACK_DAYS = 90;

type NotificationSeed = {
  dedupeKey: string;
  type: string;
  category: "APPOINTMENT" | "PREVENTIVE";
  title: string;
  message: string;
  actionPath: string;
  occurredAt: Date;
  metadata: Prisma.InputJsonValue;
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
        },
      }),
      this.petsService.getPreventiveAgenda(userId, PREVENTIVE_WINDOW_DAYS),
    ]);

    const seeds: NotificationSeed[] = appointments.flatMap((appointment) =>
      this.appointmentSeeds(appointment),
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
        // Preventive reminders are events created when the system notices the
        // threshold. Using the source due date here would bury a newly created
        // unread alert behind historical inbox entries.
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

  private appointmentSeeds(
    appointment: AppointmentForNotification,
  ): NotificationSeed[] {
    const current = this.appointmentStatusSeed(appointment);
    const seeds = current ? [current] : [];

    if (appointment.status === AppointmentStatus.CONFIRMED) {
      const today = this.utcDateOnly(new Date());
      const appointmentDay = this.utcDateOnly(appointment.date);
      const daysUntil = Math.round(
        (appointmentDay.getTime() - today.getTime()) / DAY_MS,
      );
      if (daysUntil >= 0 && daysUntil <= 1) {
        seeds.push({
          dedupeKey: `appointment:${appointment.id}:REMINDER:${appointmentDay.toISOString().slice(0, 10)}`,
          type: "APPOINTMENT_REMINDER",
          category: "APPOINTMENT",
          title:
            daysUntil === 0
              ? "Cita programada para hoy"
              : "Cita programada para mañana",
          message: `${appointment.pet.name} tiene una atención confirmada a las ${appointment.time}.`,
          actionPath: "/nvetcareapp/dashboard/citas",
          occurredAt: today,
          metadata: {
            appointmentId: appointment.id,
            petId: appointment.pet.id,
            appointmentDate: appointmentDay.toISOString().slice(0, 10),
            time: appointment.time,
          },
        });
      }
    }

    return seeds;
  }

  private appointmentStatusSeed(
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

  private utcDateOnly(value: Date): Date {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
}
