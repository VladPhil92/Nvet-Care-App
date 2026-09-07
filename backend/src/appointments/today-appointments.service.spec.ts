import { BadRequestException } from "@nestjs/common";
import { TodayAppointmentsService } from "./today-appointments.service";

describe("TodayAppointmentsService", () => {
  let prisma: any;
  let service: TodayAppointmentsService;

  beforeEach(() => {
    prisma = {
      vetProfile: { findUnique: jest.fn() },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new TodayAppointmentsService(prisma);
  });

  it("uses the veterinarian local calendar day instead of the server UTC day", async () => {
    prisma.vetProfile.findUnique.mockResolvedValue({ timezone: "America/Bogota" });

    // 04:05 UTC on Sep 7 is still Sep 6 in Bogotá. The agenda must therefore
    // query the Sep 6 date-only bucket used by appointments.
    await service.getForVet(
      "vet-profile-1",
      new Date("2026-09-07T04:05:00.000Z"),
    );

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vetId: "vet-profile-1",
          date: {
            gte: new Date("2026-09-06T00:00:00.000Z"),
            lt: new Date("2026-09-07T00:00:00.000Z"),
          },
        },
      }),
    );
  });

  it("fails closed when the stored timezone is invalid", async () => {
    prisma.vetProfile.findUnique.mockResolvedValue({ timezone: "Invalid/Timezone" });

    await expect(
      service.getForVet("vet-profile-1", new Date("2026-09-07T12:00:00.000Z")),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });
});
