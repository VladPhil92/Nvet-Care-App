import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentStatus, UserRole, VetTier } from '@prisma/client';

// Tier commission rates
const TIER_COMMISSIONS = {
  [VetTier.FREE]: 0.10,  // 10%
  [VetTier.PRO]: 0.08,   // 8%
  [VetTier.ELITE]: 0.03, // 3%
};

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

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
    const where: any = {};

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
   * Create new appointment
   */
  async createAppointment(clientId: string, data: CreateAppointmentDto) {
    // Verify vet exists and is active
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

    // Verify pet belongs to client
    const pet = await this.prisma.pet.findUnique({
      where: { id: data.petId },
    });

    if (!pet) {
      throw new NotFoundException('Pet not found');
    }

    if (pet.ownerId !== clientId) {
      throw new ForbiddenException('Pet does not belong to you');
    }

    // Calculate commission
    const commissionPct = TIER_COMMISSIONS[vet.tier];
    const commissionAmount = data.amount * commissionPct;

    // Create appointment with transaction
    const appointment = await this.prisma.appointment.create({
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
            commissionPct: commissionPct * 100, // Store as percentage
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

    return appointment;
  }

  /**
   * Update appointment
   */
  async updateAppointment(id: string, data: UpdateAppointmentDto) {
    const appointment = await this.getAppointmentById(id);

    // Can't update completed or cancelled appointments
    if (
      appointment.status === AppointmentStatus.COMPLETED ||
      appointment.status === AppointmentStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot update completed or cancelled appointments',
      );
    }

    return this.prisma.appointment.update({
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

    // Build status history from timestamps
    const statusHistory = [
      {
        status: 'PENDING',
        timestamp: appointment.createdAt.toISOString(),
      },
    ];

    // In production, we'd have a separate StatusHistory table
    // For now, derive from current status and updated timestamps

    return {
      appointmentId: id,
      currentStatus: appointment.status,
      vetLocation: null, // TODO: Integrate with GPS tracking
      estimatedArrival: null, // TODO: Calculate based on location
      statusHistory,
    };
  }

  /**
   * Update appointment status (vets only)
   */
  async updateAppointmentStatus(id: string, status: string) {
    const appointment = await this.getAppointmentById(id);

    // Validate state transition
    this.validateStatusTransition(appointment.status, status as AppointmentStatus);

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
    const appointment = await this.getAppointmentById(id);

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
