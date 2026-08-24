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
      vetProfile: {
        update: jest.fn(),
      },
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
        latitude: 10.4,
        longitude: -75.55,
        updatedAt: new Date(),
        user: {},
      },
    });

    await expect(
      service.getLiveLocation('appt-1', 'intruder', UserRole.CLIENT),
    ).rejects.toThrow(ForbiddenException);
  });

  it('oculta ubicación cuando la cita todavía no está en tracking', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appt-1',
      status: AppointmentStatus.PENDING,
      clientId: 'client-1',
      vet: {
        userId: 'vet-1',
        latitude: 10.4,
        longitude: -75.55,
        updatedAt: new Date(),
        user: {},
      },
    });

    await expect(
      service.getLiveLocation('appt-1', 'client-1', UserRole.CLIENT),
    ).resolves.toMatchObject({
      trackingActive: false,
      vetLocation: null,
    });
  });

  it('permite al vet asignado actualizar coordenadas en cita confirmada', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appt-1',
      status: AppointmentStatus.CONFIRMED,
      vet: { id: 'vet-profile-1', userId: 'vet-1' },
    });
    prisma.vetProfile.update.mockResolvedValue({
      latitude: 10.4003,
      longitude: -75.5594,
      updatedAt: new Date('2026-08-24T16:00:00.000Z'),
    });

    const result = await service.updateLiveLocation('appt-1', 'vet-1', {
      latitude: 10.4003,
      longitude: -75.5594,
      accuracy: 8,
    });

    expect(prisma.vetProfile.update).toHaveBeenCalledWith({
      where: { id: 'vet-profile-1' },
      data: { latitude: 10.4003, longitude: -75.5594 },
      select: { latitude: true, longitude: true, updatedAt: true },
    });
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
      vet: { id: 'vet-profile-1', userId: 'vet-1' },
    });

    await expect(
      service.updateLiveLocation('appt-1', 'vet-1', {
        latitude: 10.4,
        longitude: -75.55,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza citas inexistentes', async () => {
    prisma.appointment.findUnique.mockResolvedValue(null);

    await expect(
      service.getLiveLocation('missing', 'client-1', UserRole.CLIENT),
    ).rejects.toThrow(NotFoundException);
  });
});
