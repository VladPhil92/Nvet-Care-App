import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentStatus, UserRole, VetTier } from '@prisma/client';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: any;

  const CLIENT_ID = 'client-1';
  const VET_USER_ID = 'vet-user-1';
  const VET_PROFILE_ID = 'vet-profile-1';
  const PET_ID = 'pet-1';
  const APPT_ID = 'appt-1';

  const baseVet = {
    id: VET_PROFILE_ID,
    userId: VET_USER_ID,
    isActive: true,
    isVerified: true,
    tier: VetTier.PRO,
  };

  const basePet = { id: PET_ID, ownerId: CLIENT_ID };

  const baseAppointment = {
    id: APPT_ID,
    clientId: CLIENT_ID,
    status: AppointmentStatus.PENDING,
    amount: 80_000,
    notes: null,
    date: new Date('2026-09-01'),
    time: '10:00',
    createdAt: new Date('2026-07-01'),
    updatedAt: new Date('2026-07-01'),
    vet: { ...baseVet, user: { firstName: 'Dr. José', lastName: 'García' } },
    client: { id: CLIENT_ID },
    pet: basePet,
    transaction: null,
  };

  let scheduleService: any;

  beforeEach(() => {
    prisma = {
      vetProfile: { findUnique: jest.fn() },
      pet: { findUnique: jest.fn() },
      appointment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    scheduleService = {
      getAvailability: jest.fn().mockResolvedValue([
        { time: '10:00', available: true },
      ]),
    };

    service = new AppointmentsService(prisma, scheduleService);
  });

  // ─────────────────────────────────────────────────────────────────
  // createAppointment
  // ─────────────────────────────────────────────────────────────────

  describe('createAppointment', () => {
    const dto: any = {
      vetId: VET_PROFILE_ID,
      petId: PET_ID,
      serviceType: 'CONSULTATION',
      date: '2026-09-01',
      time: '10:00',
      address: 'Calle 1 # 2-3',
      amount: 80_000,
      paymentMethod: 'TRANSFER',
    };

    it('crea cita con status PENDING y datos correctos', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(baseVet);
      prisma.pet.findUnique.mockResolvedValue(basePet);
      prisma.appointment.create.mockResolvedValue({ id: APPT_ID, status: AppointmentStatus.PENDING });

      const result = await service.createAppointment(CLIENT_ID, dto);

      expect(result.status).toBe(AppointmentStatus.PENDING);
      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vetId: VET_PROFILE_ID,
            clientId: CLIENT_ID,
            petId: PET_ID,
            status: AppointmentStatus.PENDING,
          }),
        }),
      );
    });

    it('lanza NotFoundException si el vet no existe', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(null);

      await expect(service.createAppointment(CLIENT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el vet no está activo', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({ ...baseVet, isActive: false });

      await expect(service.createAppointment(CLIENT_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el vet no está verificado', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({ ...baseVet, isVerified: false });

      await expect(service.createAppointment(CLIENT_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si la mascota no existe', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(baseVet);
      prisma.pet.findUnique.mockResolvedValue(null);

      await expect(service.createAppointment(CLIENT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si la mascota no pertenece al cliente', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(baseVet);
      prisma.pet.findUnique.mockResolvedValue({ ...basePet, ownerId: 'otro-cliente' });

      await expect(service.createAppointment(CLIENT_ID, dto)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // getAppointmentById
  // ─────────────────────────────────────────────────────────────────

  describe('getAppointmentById', () => {
    it('retorna la cita si existe', async () => {
      prisma.appointment.findUnique.mockResolvedValue(baseAppointment);

      const result = await service.getAppointmentById(APPT_ID);

      expect(result.id).toBe(APPT_ID);
    });

    it('lanza NotFoundException si la cita no existe', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.getAppointmentById('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // updateAppointmentStatus
  // ─────────────────────────────────────────────────────────────────

  describe('updateAppointmentStatus', () => {
    it('permite PENDING → CONFIRMED y registra confirmedAt', async () => {
      prisma.appointment.findUnique.mockResolvedValue(baseAppointment);
      prisma.appointment.update.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.CONFIRMED,
      });

      const result = await service.updateAppointmentStatus(APPT_ID, 'CONFIRMED');

      expect(result.status).toBe(AppointmentStatus.CONFIRMED);
      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AppointmentStatus.CONFIRMED,
            confirmedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('lanza BadRequestException en transición inválida (PENDING → COMPLETED)', async () => {
      prisma.appointment.findUnique.mockResolvedValue(baseAppointment);

      await expect(
        service.updateAppointmentStatus(APPT_ID, 'COMPLETED'),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException en transición desde CANCELLED', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(
        service.updateAppointmentStatus(APPT_ID, 'CONFIRMED'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // cancelAppointment
  // ─────────────────────────────────────────────────────────────────

  describe('cancelAppointment', () => {
    it('cancela una cita PENDING', async () => {
      prisma.appointment.findUnique.mockResolvedValue(baseAppointment);
      prisma.appointment.update.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.CANCELLED,
      });

      const result = await service.cancelAppointment(APPT_ID);

      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: AppointmentStatus.CANCELLED }),
        }),
      );
    });

    it('lanza BadRequestException si la cita ya está COMPLETED', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.COMPLETED,
      });

      await expect(service.cancelAppointment(APPT_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // updateVetLocation
  // ─────────────────────────────────────────────────────────────────

  describe('updateVetLocation', () => {
    const inProgressAppt = {
      ...baseAppointment,
      status: AppointmentStatus.IN_PROGRESS,
    };

    it('actualiza la ubicación del vet', async () => {
      prisma.appointment.findUnique.mockResolvedValue(inProgressAppt);
      prisma.appointment.update.mockResolvedValue({
        id: APPT_ID,
        vetLatitude: 4.6097,
        vetLongitude: -74.0817,
      });

      const result = await service.updateVetLocation(APPT_ID, VET_USER_ID, 4.6097, -74.0817, 10);

      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vetLatitude: 4.6097,
            vetLongitude: -74.0817,
            etaMinutes: 10,
          }),
        }),
      );
    });

    it('lanza ForbiddenException si no es el vet asignado', async () => {
      prisma.appointment.findUnique.mockResolvedValue(inProgressAppt);

      await expect(
        service.updateVetLocation(APPT_ID, 'otro-vet', 4.6, -74.0),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza BadRequestException si la cita no está EN_PROGRESO', async () => {
      prisma.appointment.findUnique.mockResolvedValue(baseAppointment); // PENDING

      await expect(
        service.updateVetLocation(APPT_ID, VET_USER_ID, 4.6, -74.0),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // getAppointments (filtros por rol)
  // ─────────────────────────────────────────────────────────────────

  describe('getAppointments', () => {
    it('filtra por clientId para rol CLIENT', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.getAppointments(CLIENT_ID, UserRole.CLIENT, {});

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientId: CLIENT_ID }),
        }),
      );
    });

    it('filtra por vetId para rol VET', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({ id: VET_PROFILE_ID });
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.getAppointments(VET_USER_ID, UserRole.VET, {});

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ vetId: VET_PROFILE_ID }),
        }),
      );
    });

    it('ADMIN ve todas las citas sin filtro de usuario', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.getAppointments('admin-id', UserRole.ADMIN, {});

      const call = prisma.appointment.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('clientId');
      expect(call.where).not.toHaveProperty('vetId');
    });
  });
});
