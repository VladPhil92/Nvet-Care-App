import { ConflictException } from '@nestjs/common';
import {
  AppointmentStatus,
  PaymentMethod,
  Prisma,
  VetTier,
} from '@prisma/client';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService booking integrity', () => {
  let service: AppointmentsService;
  let prisma: any;
  let scheduleService: { getAvailability: jest.Mock };

  const createDto = {
    vetId: '11111111-1111-4111-8111-111111111111',
    petId: '22222222-2222-4222-8222-222222222222',
    serviceType: 'HOME_VISIT',
    date: '2099-01-05T16:20:00.000Z',
    time: '09:00',
    address: 'Cartagena de Indias',
    amount: 90000,
    paymentMethod: PaymentMethod.PSE,
  };

  beforeEach(() => {
    prisma = {
      vetProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: createDto.vetId,
          tier: VetTier.FREE,
          isActive: true,
          isVerified: true,
        }),
      },
      pet: {
        findUnique: jest.fn().mockResolvedValue({
          id: createDto.petId,
          ownerId: 'client-1',
        }),
      },
      appointment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    scheduleService = {
      getAvailability: jest.fn(),
    };

    service = new AppointmentsService(prisma, scheduleService as any);
  });

  it('rechaza el booking si el slot ya no está disponible', async () => {
    scheduleService.getAvailability.mockResolvedValue([
      { date: '2099-01-05', time: '09:00', available: false },
    ]);

    await expect(
      service.createAppointment('client-1', createDto),
    ).rejects.toThrow(ConflictException);

    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('reserva el slot sin crear una transacción financiera prematura', async () => {
    scheduleService.getAvailability.mockResolvedValue([
      { date: '2099-01-05', time: '09:00', available: true },
    ]);
    prisma.appointment.create.mockResolvedValue({ id: 'appointment-1' });

    await service.createAppointment('client-1', createDto);

    const call = prisma.appointment.create.mock.calls[0][0];
    expect(call.data.date.toISOString()).toBe('2099-01-05T00:00:00.000Z');
    expect(call.data.status).toBe(AppointmentStatus.PENDING);
    expect(call.data.transaction).toBeUndefined();
    expect(scheduleService.getAvailability).toHaveBeenCalledWith(
      createDto.vetId,
      '2099-01-05',
      undefined,
    );
  });

  it('convierte la violación unique P2002 en HTTP 409', async () => {
    scheduleService.getAvailability.mockResolvedValue([
      { date: '2099-01-05', time: '09:00', available: true },
    ]);

    const uniqueError = Object.assign(
      Object.create(Prisma.PrismaClientKnownRequestError.prototype),
      { code: 'P2002' },
    );
    prisma.appointment.create.mockRejectedValue(uniqueError);

    await expect(
      service.createAppointment('client-1', createDto),
    ).rejects.toThrow(ConflictException);
  });

  it('revalida reprogramaciones excluyendo la propia cita', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      vetId: createDto.vetId,
      clientId: 'client-1',
      petId: createDto.petId,
      status: AppointmentStatus.CONFIRMED,
      date: new Date('2099-01-05T00:00:00.000Z'),
      time: '09:00',
      notes: null,
      vet: { user: { id: 'vet-user-1' } },
      client: {},
      pet: {},
      transaction: {},
      createdAt: new Date(),
    });
    scheduleService.getAvailability.mockResolvedValue([
      { date: '2099-01-06', time: '10:00', available: true },
    ]);
    prisma.appointment.update.mockResolvedValue({ id: 'appointment-1' });

    await service.updateAppointment('appointment-1', {
      date: '2099-01-06',
      time: '10:00',
    });

    expect(scheduleService.getAvailability).toHaveBeenCalledWith(
      createDto.vetId,
      '2099-01-06',
      { excludeAppointmentId: 'appointment-1' },
    );
  });
});
