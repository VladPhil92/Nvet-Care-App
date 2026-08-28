import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AppointmentStatus,
  DayOfWeek,
  VerificationStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface VetAvailabilitySlot {
  date: string;
  time: string;
  available: boolean;
}

interface AvailabilityOptions {
  /**
   * Permite revalidar un cambio de fecha/hora ignorando la propia cita que
   * se está reprogramando. El endpoint público nunca utiliza esta opción.
   */
  excludeAppointmentId?: string;
}

const DAY_BY_JS_UTC: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

/**
 * Disponibilidad pública para el flujo de reserva.
 * Una excepción de fecha tiene precedencia sobre la agenda semanal y las
 * citas activas bloquean el slot correspondiente.
 */
@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailability(
    vetId: string,
    date: string,
    options: AvailabilityOptions = {},
  ): Promise<VetAvailabilitySlot[]> {
    const dayStart = this.parseDateOnly(date);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const vet = await this.prisma.vetProfile.findFirst({
      where: {
        id: vetId,
        isActive: true,
        isVerified: true,
        verificationStatus: VerificationStatus.APPROVED,
      },
      select: { id: true, timezone: true },
    });

    if (!vet) {
      throw new NotFoundException("Veterinarian not found");
    }

    const [exception, weeklySchedule, appointments] = await Promise.all([
      this.prisma.scheduleException.findFirst({
        where: {
          vetProfileId: vetId,
          date: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.prisma.vetSchedule.findUnique({
        where: {
          vetProfileId_dayOfWeek: {
            vetProfileId: vetId,
            dayOfWeek: DAY_BY_JS_UTC[dayStart.getUTCDay()],
          },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          vetId,
          date: { gte: dayStart, lt: dayEnd },
          status: {
            in: [
              AppointmentStatus.PENDING,
              AppointmentStatus.CONFIRMED,
              AppointmentStatus.IN_PROGRESS,
            ],
          },
          ...(options.excludeAppointmentId
            ? { id: { not: options.excludeAppointmentId } }
            : {}),
        },
        select: { time: true },
      }),
    ]);

    if (exception && !exception.isAvailable) {
      return [];
    }

    const startTime = exception?.startTime ?? weeklySchedule?.startTime;
    const endTime = exception?.endTime ?? weeklySchedule?.endTime;
    const slotDuration = weeklySchedule?.slotDuration ?? 60;

    if (
      !startTime ||
      !endTime ||
      (!exception && (!weeklySchedule || !weeklySchedule.isActive))
    ) {
      return [];
    }

    const bookedTimes = new Set(
      appointments.map((appointment) => appointment.time),
    );
    const slots = this.generateTimes(startTime, endTime, slotDuration);

    return slots.map((time) => ({
      date,
      time,
      available:
        !bookedTimes.has(time) && !this.isPastSlot(date, time, vet.timezone),
    }));
  }

  private parseDateOnly(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private generateTimes(
    startTime: string,
    endTime: string,
    durationMinutes: number,
  ): string[] {
    const start = this.toMinutes(startTime);
    const end = this.toMinutes(endTime);
    if (start >= end || durationMinutes <= 0) return [];

    const times: string[] = [];
    for (
      let current = start;
      current + durationMinutes <= end;
      current += durationMinutes
    ) {
      times.push(this.fromMinutes(current));
    }
    return times;
  }

  private toMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  private fromMinutes(total: number): string {
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  private isPastSlot(date: string, time: string, timezone: string): boolean {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";

    const currentDate = `${get("year")}-${get("month")}-${get("day")}`;
    if (date < currentDate) return true;
    if (date > currentDate) return false;

    const currentMinutes = Number(get("hour")) * 60 + Number(get("minute"));
    return this.toMinutes(time) <= currentMinutes;
  }
}
