import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  AllergySeverity,
  ConditionStatus,
  PreventiveCareStatus,
  PreventiveCareType,
  UpdatePetHealthProfileDto,
} from "./dto/pet-health-profile.dto";
import { PetsService } from "./pets.service";

describe("PetsService health profile V2", () => {
  const petFindUnique = jest.fn();
  const petUpdate = jest.fn();
  const prisma = {
    pet: {
      findUnique: petFindUnique,
      update: petUpdate,
    },
  } as unknown as PrismaService;
  const service = new PetsService(prisma);

  const profile = (): UpdatePetHealthProfileDto => ({
    allergies: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        substance: " Pollo ",
        reaction: "Prurito",
        severity: AllergySeverity.MODERATE,
        notedAt: "2026-01-10",
      },
    ],
    medications: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Omega 3",
        dosage: "1 cápsula",
        frequency: "Diaria",
        startedAt: "2026-02-01",
        active: true,
      },
    ],
    conditions: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Dermatitis",
        diagnosedAt: "2026-01-20",
        status: ConditionStatus.ACTIVE,
      },
    ],
    vaccinations: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        vaccine: "Rabia",
        administeredAt: "2026-03-01",
        nextDueAt: "2027-03-01",
      },
    ],
    deworming: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        product: "Antiparasitario",
        administeredAt: "2026-06-01",
        nextDueAt: "2026-09-01",
      },
    ],
    preventiveCare: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        type: PreventiveCareType.CHECKUP,
        title: "Control preventivo",
        dueAt: "2026-10-15",
        status: PreventiveCareStatus.PENDING,
      },
    ],
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("persists a versioned owner-reported document for the pet owner", async () => {
    petFindUnique.mockResolvedValue({ id: "pet-1", ownerId: "owner-1" });
    petUpdate.mockResolvedValue({ id: "pet-1" });

    await service.updateHealthProfile("owner-1", "pet-1", profile());

    expect(petUpdate).toHaveBeenCalledTimes(1);
    const call = petUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: "pet-1" });
    expect(call.data.healthProfileVersion).toBe(1);
    expect(call.data.healthProfile.schemaVersion).toBe(1);
    expect(call.data.healthProfile.source).toBe("OWNER_REPORTED");
    expect(call.data.healthProfile.allergies[0].substance).toBe("Pollo");
    expect(call.data.healthProfileUpdatedAt).toBeInstanceOf(Date);
  });

  it("rejects health-profile writes from a non-owner", async () => {
    petFindUnique.mockResolvedValue({ id: "pet-1", ownerId: "owner-1" });

    await expect(
      service.updateHealthProfile("other-user", "pet-1", profile()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(petUpdate).not.toHaveBeenCalled();
  });

  it("rejects a preventive next date before the recorded event", async () => {
    petFindUnique.mockResolvedValue({ id: "pet-1", ownerId: "owner-1" });
    const input = profile();
    input.vaccinations[0].nextDueAt = "2026-02-01";

    await expect(
      service.updateHealthProfile("owner-1", "pet-1", input),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(petUpdate).not.toHaveBeenCalled();
  });
});
