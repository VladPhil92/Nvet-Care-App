import { AppointmentsService } from "./appointments.service";

describe("AppointmentsService geographic coverage boundary", () => {
  const vet = {
    id: "vet-profile-1",
    userId: "vet-user-1",
    isActive: true,
    isVerified: true,
    city: "Cartagena de Indias",
    department: "Bolívar",
    latitude: 10.39,
    longitude: -75.48,
    serviceRadius: 10,
  };

  const dto: any = {
    vetId: vet.id,
    petId: "pet-1",
    serviceType: "CONSULTATION",
    date: "2026-09-10",
    time: "10:00",
    address: "Bocagrande, Cartagena",
    serviceLatitude: 10.4,
    serviceLongitude: -75.49,
    amount: 80_000,
    paymentMethod: "TRANSFER",
  };

  it("passes the service point and vet coverage profile before creating a booking", async () => {
    const prisma: any = {
      vetProfile: { findUnique: jest.fn().mockResolvedValue(vet) },
      pet: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: dto.petId, ownerId: "client-1" }),
      },
      appointment: {
        create: jest.fn().mockResolvedValue({ id: "appointment-1" }),
      },
    };
    const schedule: any = {
      getAvailability: jest
        .fn()
        .mockResolvedValue([{ time: "10:00", available: true }]),
    };
    const beta: any = { assertBookingAllowed: jest.fn().mockResolvedValue(undefined) };
    const coverage: any = { assertBookableLocation: jest.fn() };
    const service = new AppointmentsService(prisma, schedule, beta, coverage);

    await service.createAppointment("client-1", dto);

    expect(coverage.assertBookableLocation).toHaveBeenCalledWith({
      serviceLatitude: dto.serviceLatitude,
      serviceLongitude: dto.serviceLongitude,
      vet: {
        city: vet.city,
        department: vet.department,
        latitude: vet.latitude,
        longitude: vet.longitude,
        serviceRadius: vet.serviceRadius,
      },
    });
    expect(beta.assertBookingAllowed).toHaveBeenCalledWith(
      "client-1",
      "Cartagena de Indias",
    );
    expect(prisma.appointment.create).toHaveBeenCalledTimes(1);
  });

  it("does not create a booking when geographic coverage rejects the service point", async () => {
    const prisma: any = {
      vetProfile: { findUnique: jest.fn().mockResolvedValue(vet) },
      pet: { findUnique: jest.fn() },
      appointment: { create: jest.fn() },
    };
    const schedule: any = { getAvailability: jest.fn() };
    const beta: any = { assertBookingAllowed: jest.fn() };
    const coverage: any = {
      assertBookableLocation: jest.fn(() => {
        throw new Error("coverage denied");
      }),
    };
    const service = new AppointmentsService(prisma, schedule, beta, coverage);

    await expect(service.createAppointment("client-1", dto)).rejects.toThrow(
      "coverage denied",
    );

    expect(beta.assertBookingAllowed).not.toHaveBeenCalled();
    expect(prisma.pet.findUnique).not.toHaveBeenCalled();
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });
});
