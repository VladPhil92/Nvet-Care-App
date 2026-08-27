import { NotFoundException } from '@nestjs/common';
import { DayOfWeek } from '@prisma/client';
import { ScheduleService } from './schedule.service';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      vetProfile: {
        findFirst: jest.fn(),
      },
      scheduleException: {
        findFirst: jest.fn(),
      },
      vetSchedule: {
        findUnique: jest.fn(),
      },
      appointment: {
        findMany: jest.fn(),
      },
    };

    service = new ScheduleService(prisma);
  });

  it('genera slots y bloquea horarios que ya tienen una cita activa', async () => {
    prisma.vetProfile.findFirst.mockResolvedValue({
      id: 'vet-1',
      timezone: 'America/Bogota',
    });
    prisma.scheduleException.findFirst.mockResolvedValue(null);
    prisma.vetSchedule.findUnique.mockResolvedValue({
      dayOfWeek: DayOfWeek.MONDAY,
      startTime: '09:00',
      endTime: '12:00',
      slotDuration: 60,
      isActive: true,
    });
    prisma.appointment.findMany.mockResolvedValue([{ time: '10:00' }]);

    const result = await service.getAvailability('vet-1', '2099-01-05');

    expect(result).toEqual([
      { date: '2099-01-05', time: '09:00', available: true },
      { date: '2099-01-05', time: '10:00', available: false },
      { date: '2099-01-05', time: '11:00', available: true },
    ]);
    expect(prisma.vetSchedule.findUnique).toHaveBeenCalledWith({
      where: {
        vetProfileId_dayOfWeek: {
          vetProfileId: 'vet-1',
          dayOfWeek: DayOfWeek.MONDAY,
        },
      },
    });
  });

  it('puede excluir la propia cita al revalidar una reprogramación', async () => {
    prisma.vetProfile.findFirst.mockResolvedValue({
      id: 'vet-1',
      timezone: 'America/Bogota',
    });
    prisma.scheduleException.findFirst.mockResolvedValue(null);
    prisma.vetSchedule.findUnique.mockResolvedValue({
      dayOfWeek: DayOfWeek.MONDAY,
      startTime: '09:00',
      endTime: '11:00',
      slotDuration: 60,
      isActive: true,
    });
    prisma.appointment.findMany.mockResolvedValue([]);

    await service.getAvailability('vet-1', '2099-01-05', {
      excludeAppointmentId: 'appointment-1',
    });

    expect(prisma.appointment.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        vetId: 'vet-1',
        id: { not: 'appointment-1' },
      }),
      select: { time: true },
    });
  });

  it('una excepción no disponible cierra por completo la fecha', async () => {
    prisma.vetProfile.findFirst.mockResolvedValue({
      id: 'vet-1',
      timezone: 'America/Bogota',
    });
    prisma.scheduleException.findFirst.mockResolvedValue({
      isAvailable: false,
      startTime: null,
      endTime: null,
    });
    prisma.vetSchedule.findUnique.mockResolvedValue({
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: 60,
      isActive: true,
    });
    prisma.appointment.findMany.mockResolvedValue([]);

    await expect(
      service.getAvailability('vet-1', '2099-01-05'),
    ).resolves.toEqual([]);
  });

  it('una excepción disponible puede sobrescribir la ventana semanal', async () => {
    prisma.vetProfile.findFirst.mockResolvedValue({
      id: 'vet-1',
      timezone: 'America/Bogota',
    });
    prisma.scheduleException.findFirst.mockResolvedValue({
      isAvailable: true,
      startTime: '14:00',
      endTime: '16:00',
    });
    prisma.vetSchedule.findUnique.mockResolvedValue({
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: 30,
      isActive: true,
    });
    prisma.appointment.findMany.mockResolvedValue([]);

    const result = await service.getAvailability('vet-1', '2099-01-05');

    expect(result.map((slot) => slot.time)).toEqual([
      '14:00',
      '14:30',
      '15:00',
      '15:30',
    ]);
  });

  it('retorna vacío cuando no existe agenda activa para el día', async () => {
    prisma.vetProfile.findFirst.mockResolvedValue({
      id: 'vet-1',
      timezone: 'America/Bogota',
    });
    prisma.scheduleException.findFirst.mockResolvedValue(null);
    prisma.vetSchedule.findUnique.mockResolvedValue(null);
    prisma.appointment.findMany.mockResolvedValue([]);

    await expect(
      service.getAvailability('vet-1', '2099-01-05'),
    ).resolves.toEqual([]);
  });

  it('no expone disponibilidad de veterinarios inexistentes o no verificables', async () => {
    prisma.vetProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.getAvailability('missing-vet', '2099-01-05'),
    ).rejects.toThrow(NotFoundException);
  });
});
