import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  Prisma,
  UserRole,
  VetTier,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleService } from '../vets/schedule.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

// Tier commission rates
const TIER_COMMISSIONS = {
  [VetTier.FREE]: 0.1, // 10%
  [VetTier.PRO]: 0.08, // 8%
  [VetTier.ELITE]: 0.03, // 3%
};

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: ScheduleService,
  ) {}

  /**
   * Get appointments with filters
   */
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

    // Filter by role
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
    // ADMIN sees all

    // Apply filters
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
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Get today's appointments for a vet
   */
  async getTodayAppointments(vetProfileId: string) {
    if (!vetProfileId) {
      throw new BadRequestException('Vet profile not found');
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
      orderBy: { time: 'asc' },
    });
  }

  /**
   * Get appointment by ID
   */
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
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  /**
   * Create new appointment.
   *
   * El slot se valida contra la agenda real antes del write. La restricción
   * parcial de base de datos `appointments_active_slot_unique` actúa como
   * segunda barrera ante dos requests concurrentes que pasen la validación
   * al mismo tiempo.
   */
  async createAppointment(clientId: string, data: CreateAppointmentDto) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { id: data.vetId },
    });

    if (!vet) {
      throw new NotFoundException('Veterinarian not found');
    }

    if (!vet.isActive) {
      throw new BadRequestException('Veterinarian is not active');
    }

    if (!vet.isVerified) {
      throw new BadRequestException('Veterinarian is not verified');
    }

    const pet = await this.prisma.pet.findUnique({
      where: { id: data.petId },
    });

    if (!pet) {
      throw new NotFoundException('Pet not found');
    }

    if (pet.ownerId !== clientId) {
      throw new ForbiddenException('Pet does not belong to you');
    }

    const dateOnly = this.toDateOnly(data.date);
    await this.assertSlotAvailable(data.vetId, dateOnly, data.time);

    const commissionPct = TIER_COMMISSIONS[vet.tier];
    const commissionAmount = data.amount * commissionPct;

    try {
      return await this.prisma.appointment.create({
        data: {
          vetId: data.vetId,
          clientId,
          petId: data.petId,
          serviceType: data.serviceType,
          date: new Date(data.date),
          time: data.time,
          address: data.address,
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          notes: data.notes,
          status: AppointmentStatus.PENDING,
          transaction: {
            create: {
              amountCop: data.amount,
              amountCtg: data.amountCtg,
              commissionPct: commissionPct * 100,
              commissionAmount,
              paymentMethod: data.paymentMethod,
            },
          },
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
   * Update appointment. Reprogramar fecha u hora vuelve a validar el slot
   * ignorando la propia cita para evitar un falso conflicto.
   */
  async updateAppointment(id: string, data: UpdateAppointmentDto) {
    const appointment = await this.getAppointmentById(id);

    if (
      appointment.status === AppointmentStatus.COMPLETED ||
      appointment.status === AppointmentStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot update completed or cancelled appointments',
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
          ...(data.date && { date: new Date(data.date) }),
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

  /**
   * Cancel appointment
   */
  async cancelAppointment(id: string, reason?: string) {
    const appointment = await this.getAppointmentById(id);

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed appointment');
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
        notes: reason
          ? `${appointment.notes || ''}\n[CANCELLED] ${reason}`.trim()
          : appointment.notes,
      },
    });
  }

  /**
   * Get appointment tracking
   */
  async getAppointmentTracking(id: string) {
    const appointment = await this.getAppointmentById(id);

    const statusHistory = [
      {
        status: 'PENDING',
        timestamp: appointment.createdAt.toISOString(),
      },
    ];

    return {
      appointmentId: id,
      currentStatus: appointment.status,
      vetLocation: null,
      estimatedArrival: null,
      statusHistory,
    };
  }

  /**
   * Update appointment status (vets only)
   */
  async updateAppointmentStatus(id: string, status: string) {
    const appointment = await this.getAppointmentById(id);

    this.validateStatusTransition(
      appointment.status,
      status as AppointmentStatus,
    );

    return this.prisma.appointment.update({
      where: { id },
      data: {
        status: status as AppointmentStatus,
      },
      include: {
        vet: { include: { user: true } },
        client: true,
        pet: true,
      },
    });
  }

  /**
   * Add clinical notes (vets only)
   */
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
        'The selected veterinarian time slot is no longer available',
      );
    }
  }

  private toDateOnly(value: string | Date): string {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid appointment date');
    }
    return parsed.toISOString().slice(0, 10);
  }

  private rethrowBookingConflict(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'The selected veterinarian time slot was just booked by another client',
      );
    }
  }

  /**
   * Validate status transition
   */
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
