import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClinicalRecordService } from "./clinical-record.service";

describe("ClinicalRecordService V3", () => {
  const petFindUnique = jest.fn();
  const appointmentFindMany = jest.fn();
  const prisma = {
    pet: { findUnique: petFindUnique },
    appointment: { findMany: appointmentFindMany },
  } as unknown as PrismaService;
  const service = new ClinicalRecordService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("separates OWNER_REPORTED data from VET_AUTHORED completed care", async () => {
    petFindUnique.mockResolvedValue({
      id: "pet-1",
      ownerId: "owner-1",
      name: "Luna",
      species: "DOG",
      breed: "Mestiza",
      weight: 12,
      birthDate: new Date("2020-01-01T00:00:00.000Z"),
      photo: null,
      healthProfile: {
        schemaVersion: 1,
        source: "OWNER_REPORTED",
        allergies: [],
      },
      healthProfileVersion: 1,
      healthProfileUpdatedAt: new Date("2026-08-20T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-20T00:00:00.000Z"),
    });
    appointmentFindMany.mockResolvedValue([
      {
        id: "appointment-1",
        serviceType: "Consulta general",
        date: new Date("2026-08-10T00:00:00.000Z"),
        time: "10:00",
        diagnosis: " Dermatitis ",
        treatment: " Baño medicado ",
        completedAt: new Date("2026-08-10T15:30:00.000Z"),
        updatedAt: new Date("2026-08-10T15:30:00.000Z"),
        vet: { user: { firstName: "Ana", lastName: "Pérez" } },
      },
      {
        id: "appointment-2",
        serviceType: "Control",
        date: new Date("2026-07-01T00:00:00.000Z"),
        time: "09:00",
        diagnosis: null,
        treatment: null,
        completedAt: new Date("2026-07-01T14:00:00.000Z"),
        updatedAt: new Date("2026-07-01T14:00:00.000Z"),
        vet: { user: { firstName: "Luis", lastName: "Gómez" } },
      },
    ]);

    const result = await service.getClientRecord("owner-1", "pet-1");

    expect(result.schemaVersion).toBe(3);
    expect(result.ownerReported.source).toBe("OWNER_REPORTED");
    expect(result.ownerReported.available).toBe(true);
    expect(result.vetAuthored.source).toBe("VET_AUTHORED");
    expect(result.vetAuthored.records[0]).toEqual(
      expect.objectContaining({
        source: "VET_AUTHORED",
        diagnosis: "Dermatitis",
        treatment: "Baño medicado",
        hasClinicalNote: true,
      }),
    );
    expect(result.vetAuthored.records[1].hasClinicalNote).toBe(false);
    expect(result.summary).toEqual({
      completedAttendances: 2,
      documentedAttendances: 1,
      ownerReportedProfileAvailable: true,
    });
    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          petId: "pet-1",
          clientId: "owner-1",
          status: "COMPLETED",
        }),
      }),
    );
  });

  it("fails closed when the authenticated user does not own the pet", async () => {
    petFindUnique.mockResolvedValue({ id: "pet-1", ownerId: "owner-1" });

    await expect(
      service.getClientRecord("other-user", "pet-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(appointmentFindMany).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing pet", async () => {
    petFindUnique.mockResolvedValue(null);

    await expect(
      service.getClientRecord("owner-1", "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(appointmentFindMany).not.toHaveBeenCalled();
  });

  it("does not present malformed legacy JSON as OWNER_REPORTED evidence", async () => {
    petFindUnique.mockResolvedValue({
      id: "pet-1",
      ownerId: "owner-1",
      name: "Luna",
      species: "DOG",
      breed: null,
      weight: null,
      birthDate: null,
      photo: null,
      healthProfile: { schemaVersion: 1, source: "UNKNOWN" },
      healthProfileVersion: 1,
      healthProfileUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    appointmentFindMany.mockResolvedValue([]);

    const result = await service.getClientRecord("owner-1", "pet-1");

    expect(result.ownerReported.available).toBe(false);
    expect(result.ownerReported.data).toBeNull();
  });
});
