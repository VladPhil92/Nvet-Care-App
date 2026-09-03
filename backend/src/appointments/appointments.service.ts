import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { AppointmentStatus, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleService } from "../vets/schedule.service";
import { ClosedBetaAccessService } from "../beta/closed-beta-access.service";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { UpdateAppointmentDto } from "./dto/update-appointment.dto";

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: ScheduleService,
    private readonly closedBetaAccess: ClosedBetaAccessService = new ClosedBetaAccessService(),
  ) {}

  async getAppointments(
    userId: string,
    userRole: UserRole,
    filters: {
      status?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const where: Prisma.AppointmentWhereInput = {};

    if (userRole === UserRole.CLIENT) {
      where.clientId = userId;
    } else if (userRole === UserRole.VET) {
      const vetProfile = await this.prisma.vetProfile.findUnique({
        where: { userId },
      });
      if (vetProfile) {
        where.vetId = vetProfile.id;
      }
    }

    if (filters.status) {
      where.status = filters.status as AppointmentStatus;
    }

    if (filters.startDate || filters.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = new Date(filters.startDate);
      if (filters.endDate) where.date.lte = new Date(filters.endDate);
    }

    return this.prisma.appointment.findMany({
      where,
      include: {
        vet: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        pet: true,
      },
      orderBy: { date: "desc" },
    });
  }

  async getTodayAppointments(vetProfileId: string) {
    if (!vetProfileId) {
      throw new BadRequestException("Vet profile not found");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

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

  async getAppointmentById(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        vet: {
          include: {
            user: true,
          },
        },
        client: true,
        pet: true,
        transaction: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }

    return appointment;
  }

  /**
   * Crear la cita reserva exclusivamente el slot. La transacción financiera
   * se crea después, en PaymentsService, cuando el cliente realmente inicia
   * el pago. Separar ambos pasos evita una transacción PENDING fantasma que
   * bloqueaba `/payments/process` inmediatamente después del booking.
   */
  async createAppointment(clientId: string, data: CreateAppointmentDto) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { id: data.vetId },
    });

    if (!vet) {
      throw new NotFoundException("Veterinarian not found");
    }
    if (!vet.isActive) {
      throw new BadRequestException("Veterinarian is not active");
    }
    if (!vet.isVerified) {
      throw new BadRequestException("Veterinarian is not verified");
    }

    // Phase 12 closed-beta boundary. Disabled by default; when operations
    // enables it, booking becomes invite-only, Cartagena-only and requires
    // explicit acceptance of the current beta legal contract.
    await this.closedBetaAccess.assertBookingAllowed(clientId, vet.city);

    const pet = await this.prisma.pet.findUnique({
      where: { id: data.petId },
    });

    if (!pet) {
      throw new NotFoundException("Pet not found");
    }
    if (pet.ownerId !== clientId) {
      throw new ForbiddenException("Pet does not belong to you");
    }

    const dateOnly = this.toDateOnly(data.date);
    await this.assertSlotAvailable(data.vetId, dateOnly, data.time);

    try {
      return await this.prisma.appointment.create({
        data: {
          vetId: data.vetId,
          clientId,
          petId: data.petId,
          serviceType: data.serviceType,
          date: this.toUtcDateOnly(data.date),
          time: data.time,
          address: data.address,
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          notes: data.notes,
          status: AppointmentStatus.PENDING,
        },
        include: {
          vet: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
          },
          client: true,
          pet: true,
          transaction: true,
        },
      });
    } catch (error) {
      this.rethrowBookingConflict(error);
      throw error;
    }
  }

  /**
   * Reprogramar fecha u hora vuelve a validar disponibilidad. La cita actual
   * se excluye del cálculo para que mantener el mismo slot no sea un falso
   * conflicto.
   */
  async updateAppointment(id: string, data: UpdateAppointmentDto) {
    const appointment = await this.getAppointmentById(id);

    if (
      appointment.status === AppointmentStatus.COMPLETED ||
      appointment.status === AppointmentStatus.CANCELLED
    ) {
      throw new BadRequestException(
        "Cannot update completed or cancelled appointments",
      );
    }

    if (data.date || data.time) {
      const targetDate = data.date
        ? this.toDateOnly(data.date)
        : this.toDateOnly(appointment.date);
      const targetTime = data.time ?? appointment.time;

      await this.assertSlotAvailable(
        appointment.vetId,
        targetDate,
        targetTime,
        id,
      );
    }

    try {
      return await this.prisma.appointment.update({
        where: { id },
        data: {
          ...(data.date && { date: this.toUtcDateOnly(data.date) }),
          ...(data.time && { time: data.time }),
          ...(data.address && { address: data.address }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        include: {
          vet: { include: { user: true } },
          client: true,
          pet: true,
          transaction: true,
        },
      });
    } catch (error) {
      this.rethrowBookingConflict(error);
      throw error;
    }
  }

  async cancelAppointment(id: string, reason?: string) {
    const appointment = await this.getAppointmentById(id);

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException("Cannot cancel completed appointment");
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
        notes: reason
          ? `${appointment.notes || ""}\n[CANCELLED] ${reason}`.trim()
          : appointment.notes,
      },
    });
  }

  /**
   * Get appointment tracking with GPS location and ETA
   */
  async getAppointmentTracking(id: string) {
    const appointment = await this.getAppointmentById(id);

    const statusHistory: { status: string; timestamp: string }[] = [
      { status: "PENDING", timestamp: appointment.createdAt.toISOString() },
    ];

    if (appointment.confirmedAt) {
      statusHistory.push({
        status: "CONFIRMED",
        timestamp: appointment.confirmedAt.toISOString(),
      });
    }
    if (appointment.inProgressAt) {
      statusHistory.push({
        status: "IN_PROGRESS",
        timestamp: appointment.inProgressAt.toISOString(),
      });
    }
    if (appointment.completedAt) {
      statusHistory.push({
        status: "COMPLETED",
        timestamp: appointment.completedAt.toISOString(),
      });
    }

    const vetLocation =
      appointment.vetLatitude != null && appointment.vetLongitude != null
        ? {
            latitude: appointment.vetLatitude,
            longitude: appointment.vetLongitude,
            updatedAt: appointment.vetLocationAt,
          }
        : null;

    let estimatedArrival: string | null =
      appointment.etaMinutes != null
        ? new Date(
            Date.now() + appointment.etaMinutes * 60 * 1000,
          ).toISOString()
        : null;

    if (
      !estimatedArrival &&
      appointment.status === AppointmentStatus.CONFIRMED
    ) {
      const [hours, minutes] = appointment.time.split(":").map(Number);
      const scheduled = new Date(appointment.date);
      scheduled.setHours(hours, minutes, 0, 0);
      if (scheduled > new Date()) {
        estimatedArrival = scheduled.toISOString();
      }
    }

    return {
      appointmentId: id,
      currentStatus: appointment.status,
      vetLocation,
      estimatedArrival,
      etaMinutes: appointment.etaMinutes ?? null,
      scheduledAt: (appointment as any).scheduledAt ?? appointment.date,
      lastStatusChangeAt:
        appointment.lastStatusChangeAt ?? appointment.updatedAt,
      statusHistory,
    };
  }

  /**
   * Update vet GPS location for an in-progress appointment
   */
  async updateVetLocation(
    id: string,
    vetUserId: string,
    latitude: number,
    longitude: number,
    etaMinutes?: number,
  ) {
    const appointment = await this.getAppointmentById(id);

    if (appointment.vet.userId !== vetUserId) {
      throw new ForbiddenException("Only the assigned vet can update location");
    }

    if (appointment.status !== AppointmentStatus.IN_PROGRESS) {
      throw new BadRequestException(
        "Location updates only allowed for in-progress appointments",
      );
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        vetLatitude: latitude,
        vetLongitude: longitude,
        vetLocationAt: new Date(),
        ...(etaMinutes != null && { etaMinutes }),
      },
      select: {
        id: true,
        vetLatitude: true,
        vetLongitude: true,
        vetLocationAt: true,
        etaMinutes: true,
      },
    });
  }

  /**
   * Update appointment status (vets only) — records per-status timestamps
   */
  async updateAppointmentStatus(id: string, status: string) {
    const appointment = await this.getAppointmentById(id);
    const next = status as AppointmentStatus;

    this.validateStatusTransition(appointment.status, next);

    const now = new Date();
    const timestampField: Prisma.AppointmentUpdateInput = {
      lastStatusChangeAt: now,
    };

    if (next === AppointmentStatus.CONFIRMED) timestampField.confirmedAt = now;
    if (next === AppointmentStatus.IN_PROGRESS)
      timestampField.inProgressAt = now;
    if (next === AppointmentStatus.COMPLETED) timestampField.completedAt = now;

    return this.prisma.appointment.update({
      where: { id },
      data: {
        status: next,
        ...timestampField,
      },
      include: {
        vet: { include: { user: true } },
        client: true,
        pet: true,
      },
    });
  }

  async addClinicalNotes(id: string, diagnosis: string, treatment: string) {
    await this.getAppointmentById(id);

    return this.prisma.appointment.update({
      where: { id },
      data: {
        diagnosis,
        treatment,
      },
      include: {
        vet: { include: { user: true } },
        client: true,
        pet: true,
      },
    });
  }

  private async assertSlotAvailable(
    vetId: string,
    date: string,
    time: string,
    excludeAppointmentId?: string,
  ): Promise<void> {
    const availability = await this.scheduleService.getAvailability(
      vetId,
      date,
      excludeAppointmentId ? { excludeAppointmentId } : undefined,
    );
    const slot = availability.find((candidate) => candidate.time === time);

    if (!slot?.available) {
      throw new ConflictException(
        "The selected veterinarian time slot is no longer available",
      );
    }
  }

  private toDateOnly(value: string | Date): string {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("Invalid appointment date");
    }
    return parsed.toISOString().slice(0, 10);
  }

  private toUtcDateOnly(value: string | Date): Date {
    const dateOnly = this.toDateOnly(value);
    return new Date(`${dateOnly}T00:00:00.000Z`);
  }

  private rethrowBookingConflict(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(
        "The selected veterinarian time slot was just booked by another client",
      );
    }
  }

  private validateStatusTransition(
    current: AppointmentStatus,
    next: AppointmentStatus,
  ) {
    const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      PENDING: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
      CONFIRMED: [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CANCELLED],
      IN_PROGRESS: [AppointmentStatus.COMPLETED, AppointmentStatus.DISPUTED],
      COMPLETED: [AppointmentStatus.DISPUTED],
      CANCELLED: [],
      DISPUTED: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
    };

    if (!validTransitions[current]?.includes(next)) {
      throw new BadRequestException(
        `Invalid status transition from ${current} to ${next}`,
      );
    }
  }
}
