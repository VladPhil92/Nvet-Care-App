import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, UserRole } from '@prisma/client';
import { LiveLocationService } from './live-location.service';

describe('LiveLocationService', () => {
  let service: LiveLocationService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      appointment: {
        findUnique: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    service = new LiveLocationService(prisma);
  });

  it('solo expone ubicación a participantes de la cita o admin', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appt-1',
      status: AppointmentStatus.CONFIRMED,
      clientId: 'client-1',
      vet: {
        userId: 'vet-1',
        user: {},
      },
    });

    await expect(
      service.getLiveLocation('appt-1', 'intruder', UserRole.CLIENT),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('oculta ubicación cuando la cita todavía no está en tracking', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appt-1',
      status: AppointmentStatus.PENDING,
      clientId: 'client-1',
      vet: {
        userId: 'vet-1',
        user: {},
      },
    });

    await expect(
      service.getLiveLocation('appt-1', 'client-1', UserRole.CLIENT),
    ).resolves.toMatchObject({
      trackingActive: false,
      vetLocation: null,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('lee la ubicación privada asociada a la cita activa', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appt-1',
      status: AppointmentStatus.CONFIRMED,
      clientId: 'client-1',
      vet: {
        userId: 'vet-1',
        user: { firstName: 'Ana' },
      },
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        latitude: 10.4003,
        longitude: -75.5594,
        accuracy: 7,
        heading: 180,
        speed_mps: 4,
        updated_at: new Date(),
      },
    ]);

    await expect(
      service.getLiveLocation('appt-1', 'client-1', UserRole.CLIENT),
    ).resolves.toMatchObject({
      trackingActive: true,
      isStale: false,
      vetLocation: {
        latitude: 10.4003,
        longitude: -75.5594,
        accuracy: 7,
        heading: 180,
        speedMps: 4,
      },
    });
  });

  it('permite al vet asignado actualizar coordenadas en cita confirmada', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appt-1',
      status: AppointmentStatus.CONFIRMED,
      vet: { userId: 'vet-1' },
    });

    const result = await service.updateLiveLocation('appt-1', 'vet-1', {
      latitude: 10.4003,
      longitude: -75.5594,
      accuracy: 8,
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      trackingActive: true,
      vetLocation: {
        latitude: 10.4003,
        longitude: -75.5594,
        accuracy: 8,
      },
    });
  });

  it('rechaza ubicación del vet si la cita no está confirmada/en curso', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appt-1',
      status: AppointmentStatus.PENDING,
      vet: { userId: 'vet-1' },
    });

    await expect(
      service.updateLiveLocation('appt-1', 'vet-1', {
        latitude: 10.4,
        longitude: -75.55,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('rechaza citas inexistentes', async () => {
    prisma.appointment.findUnique.mockResolvedValue(null);

    await expect(
      service.getLiveLocation('missing', 'client-1', UserRole.CLIENT),
    ).rejects.toThrow(NotFoundException);
  });

  it('puede eliminar la última posición privada al cerrar una cita', async () => {
    await service.clearLiveLocation('appt-1');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
