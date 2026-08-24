import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateLiveLocationDto } from './dto/update-live-location.dto';

const TRACKABLE_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.IN_PROGRESS,
]);

const LOCATION_STALE_AFTER_MS = 2 * 60 * 1000;

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
            latitude: true,
            longitude: true,
            updatedAt: true,
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
      throw new NotFoundException('Appointment not found');
    }

    const isClient = appointment.clientId === requesterId;
    const isVet = appointment.vet.userId === requesterId;
    const isAdmin = requesterRole === UserRole.ADMIN;

    if (!isClient && !isVet && !isAdmin) {
      throw new ForbiddenException('You do not have access to this tracking');
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

    const hasCoordinates =
      appointment.vet.latitude !== null && appointment.vet.longitude !== null;
    const ageMs = Date.now() - appointment.vet.updatedAt.getTime();

    return {
      appointmentId,
      status: appointment.status,
      trackingActive: true,
      vetLocation: hasCoordinates
        ? {
            latitude: appointment.vet.latitude,
            longitude: appointment.vet.longitude,
          }
        : null,
      locationUpdatedAt: hasCoordinates
        ? appointment.vet.updatedAt.toISOString()
        : null,
      isStale: hasCoordinates ? ageMs > LOCATION_STALE_AFTER_MS : false,
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
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.vet.userId !== vetUserId) {
      throw new ForbiddenException(
        'Only the veterinarian assigned to this appointment can share location',
      );
    }

    if (!TRACKABLE_STATUSES.has(appointment.status)) {
      throw new BadRequestException(
        'Live location is only allowed for confirmed or in-progress appointments',
      );
    }

    const vet = await this.prisma.vetProfile.update({
      where: { id: appointment.vet.id },
      data: {
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      select: {
        latitude: true,
        longitude: true,
        updatedAt: true,
      },
    });

    return {
      appointmentId,
      status: appointment.status,
      trackingActive: true,
      vetLocation: {
        latitude: vet.latitude,
        longitude: vet.longitude,
        accuracy: dto.accuracy ?? null,
        heading: dto.heading ?? null,
        speedMps: dto.speedMps ?? null,
      },
      locationUpdatedAt: vet.updatedAt.toISOString(),
      isStale: false,
    };
  }
}
