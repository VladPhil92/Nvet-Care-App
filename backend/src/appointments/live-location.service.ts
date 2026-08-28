import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AppointmentStatus, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateLiveLocationDto } from "./dto/update-live-location.dto";

const TRACKABLE_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.IN_PROGRESS,
]);

const LOCATION_STALE_AFTER_MS = 2 * 60 * 1000;

interface LiveLocationRow {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed_mps: number | null;
  updated_at: Date;
}

@Injectable()
export class LiveLocationService {
  constructor(private readonly prisma: PrismaService) {}

  async getLiveLocation(
    appointmentId: string,
    requesterId: string,
    requesterRole: UserRole,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        status: true,
        clientId: true,
        vet: {
          select: {
            userId: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }

    const isClient = appointment.clientId === requesterId;
    const isVet = appointment.vet.userId === requesterId;
    const isAdmin = requesterRole === UserRole.ADMIN;

    if (!isClient && !isVet && !isAdmin) {
      throw new ForbiddenException("You do not have access to this tracking");
    }

    if (!TRACKABLE_STATUSES.has(appointment.status)) {
      return {
        appointmentId,
        status: appointment.status,
        trackingActive: false,
        vetLocation: null,
        locationUpdatedAt: null,
        isStale: false,
        vet: appointment.vet.user,
      };
    }

    const rows = await this.prisma.$queryRaw<LiveLocationRow[]>(
      Prisma.sql`
        SELECT latitude, longitude, accuracy, heading, speed_mps, updated_at
        FROM appointment_live_locations
        WHERE appointment_id = ${appointmentId}::uuid
        LIMIT 1
      `,
    );
    const location = rows[0] ?? null;
    const ageMs = location
      ? Date.now() - new Date(location.updated_at).getTime()
      : 0;

    return {
      appointmentId,
      status: appointment.status,
      trackingActive: true,
      vetLocation: location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            heading: location.heading,
            speedMps: location.speed_mps,
          }
        : null,
      locationUpdatedAt: location
        ? new Date(location.updated_at).toISOString()
        : null,
      isStale: location ? ageMs > LOCATION_STALE_AFTER_MS : false,
      vet: appointment.vet.user,
    };
  }

  async updateLiveLocation(
    appointmentId: string,
    vetUserId: string,
    dto: UpdateLiveLocationDto,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        status: true,
        vet: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }

    if (appointment.vet.userId !== vetUserId) {
      throw new ForbiddenException(
        "Only the veterinarian assigned to this appointment can share location",
      );
    }

    if (!TRACKABLE_STATUSES.has(appointment.status)) {
      throw new BadRequestException(
        "Live location is only allowed for confirmed or in-progress appointments",
      );
    }

    const updatedAt = new Date();
    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO appointment_live_locations (
          appointment_id,
          latitude,
          longitude,
          accuracy,
          heading,
          speed_mps,
          updated_at
        ) VALUES (
          ${appointmentId}::uuid,
          ${dto.latitude},
          ${dto.longitude},
          ${dto.accuracy ?? null},
          ${dto.heading ?? null},
          ${dto.speedMps ?? null},
          ${updatedAt}
        )
        ON CONFLICT (appointment_id)
        DO UPDATE SET
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          accuracy = EXCLUDED.accuracy,
          heading = EXCLUDED.heading,
          speed_mps = EXCLUDED.speed_mps,
          updated_at = EXCLUDED.updated_at
      `,
    );

    return {
      appointmentId,
      status: appointment.status,
      trackingActive: true,
      vetLocation: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy ?? null,
        heading: dto.heading ?? null,
        speedMps: dto.speedMps ?? null,
      },
      locationUpdatedAt: updatedAt.toISOString(),
      isStale: false,
    };
  }

  async clearLiveLocation(appointmentId: string): Promise<void> {
    await this.prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM appointment_live_locations
        WHERE appointment_id = ${appointmentId}::uuid
      `,
    );
  }
}
