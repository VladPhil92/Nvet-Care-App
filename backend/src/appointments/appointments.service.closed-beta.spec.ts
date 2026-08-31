import { PaymentMethod, VetTier } from "@prisma/client";
import { AppointmentsService } from "./appointments.service";

describe("AppointmentsService closed beta boundary", () => {
  it("checks beta eligibility before reading the pet or reserving the slot", async () => {
    const vet = {
      id: "vet-profile-1",
      tier: VetTier.PRO,
      isActive: true,
      isVerified: true,
      city: "Cartagena",
    };
    const prisma: any = {
      vetProfile: { findUnique: jest.fn().mockResolvedValue(vet) },
      pet: { findUnique: jest.fn() },
      appointment: { create: jest.fn() },
    };
    const scheduleService: any = { getAvailability: jest.fn() };
    const closedBetaAccess: any = {
      assertBookingAllowed: jest.fn(() => {
        throw new Error("beta-blocked");
      }),
    };

    const service = new AppointmentsService(
      prisma,
      scheduleService,
      closedBetaAccess,
    );

    await expect(
      service.createAppointment("client-1", {
        vetId: vet.id,
        petId: "pet-1",
        serviceType: "HOME_VISIT",
        date: "2099-01-05",
        time: "09:00",
        address: "Bocagrande, Cartagena",
        amount: 90000,
        paymentMethod: PaymentMethod.TRANSFER,
      }),
    ).rejects.toThrow("beta-blocked");

    expect(closedBetaAccess.assertBookingAllowed).toHaveBeenCalledWith(
      "client-1",
      "Cartagena",
    );
    expect(prisma.pet.findUnique).not.toHaveBeenCalled();
    expect(scheduleService.getAvailability).not.toHaveBeenCalled();
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });
});
