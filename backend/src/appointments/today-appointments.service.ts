import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TodayAppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForVet(vetProfileId: string, now = new Date()) {
    if (!vetProfileId) {
      throw new BadRequestException("Vet profile not found");
    }

    const vet = await this.prisma.vetProfile.findUnique({
      where: { id: vetProfileId },
      select: { timezone: true },
    });

    if (!vet) {
      throw new BadRequestException("Vet profile not found");
    }

    const timezone = vet.timezone?.trim() || "UTC";
    const dateOnly = this.dateOnlyInTimezone(now, timezone);
    const today = new Date(`${dateOnly}T00:00:00.000Z`);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    return this.prisma.appointment.findMany({
      where: {
        vetId: vetProfileId,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatar: true,
          },
        },
        pet: true,
      },
      orderBy: { time: "asc" },
    });
  }

  private dateOnlyInTimezone(now: Date, timezone: string): string {
    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
    } catch {
      throw new BadRequestException("Invalid veterinarian timezone");
    }

    const values = Object.fromEntries(
      parts
        .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
        .map((part) => [part.type, part.value]),
    ) as Record<"year" | "month" | "day", string>;

    if (!values.year || !values.month || !values.day) {
      throw new BadRequestException("Unable to resolve veterinarian local date");
    }

    return `${values.year}-${values.month}-${values.day}`;
  }
}
