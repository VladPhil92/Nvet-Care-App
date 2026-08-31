import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PetsService } from "./pets.service";

describe("PetsService preventive agenda V1", () => {
  const petFindMany = jest.fn();
  const prisma = {
    pet: {
      findMany: petFindMany,
    },
  } as unknown as PrismaService;
  const service = new PetsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("derives overdue, due-soon and upcoming items only from the owner's pets", async () => {
    petFindMany.mockResolvedValue([
      {
        id: "pet-1",
        name: "Luna",
        species: "DOG",
        healthProfile: {
          schemaVersion: 1,
          source: "OWNER_REPORTED",
          vaccinations: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              vaccine: "Rabia",
              nextDueAt: "2026-08-30",
            },
            {
              id: "77777777-7777-4777-8777-777777777777",
              vaccine: "Fecha imposible",
              nextDueAt: "2026-02-31",
            },
          ],
          deworming: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              product: "Antiparasitario",
              nextDueAt: "2026-09-15",
            },
          ],
          preventiveCare: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              type: "DENTAL",
              title: "Control dental",
              dueAt: "2027-01-15",
              status: "PENDING",
            },
            {
              id: "44444444-4444-4444-8444-444444444444",
              type: "CHECKUP",
              title: "Control ya realizado",
              dueAt: "2026-09-05",
              status: "COMPLETED",
            },
          ],
        },
      },
    ]);

    const result = await service.getPreventiveAgenda("owner-1", 60);

    expect(petFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "owner-1" } }),
    );
    expect(result.summary).toEqual({
      total: 3,
      overdue: 1,
      dueSoon: 1,
      upcoming: 1,
    });
    expect(result.items.map((item) => [item.title, item.status])).toEqual([
      ["Próxima vacuna: Rabia", "OVERDUE"],
      ["Próxima desparasitación: Antiparasitario", "DUE_SOON"],
      ["Control dental", "UPCOMING"],
    ]);
    expect(result.items[0].daysUntilDue).toBe(-1);
    expect(result.items[1].daysUntilDue).toBe(15);
  });

  it("returns an empty agenda for pets without a valid preventive profile", async () => {
    petFindMany.mockResolvedValue([
      { id: "pet-1", name: "Milo", species: "CAT", healthProfile: null },
      { id: "pet-2", name: "Nala", species: "DOG", healthProfile: "legacy" },
      {
        id: "pet-3",
        name: "Toby",
        species: "DOG",
        healthProfile: {
          vaccinations: [
            {
              id: "99999999-9999-4999-8999-999999999999",
              vaccine: "Legacy",
              nextDueAt: "2026-09-01",
            },
          ],
        },
      },
      {
        id: "pet-4",
        name: "Kira",
        species: "CAT",
        healthProfile: {
          schemaVersion: 1,
          source: "VET_REPORTED",
          preventiveCare: [
            {
              id: "88888888-8888-4888-8888-888888888888",
              type: "CHECKUP",
              title: "Fuente no soportada",
              dueAt: "2026-09-01",
              status: "PENDING",
            },
          ],
        },
      },
    ]);

    await expect(service.getPreventiveAgenda("owner-1")).resolves.toEqual(
      expect.objectContaining({
        windowDays: 60,
        summary: { total: 0, overdue: 0, dueSoon: 0, upcoming: 0 },
        items: [],
      }),
    );
  });

  it("rejects unsafe agenda windows", async () => {
    await expect(
      service.getPreventiveAgenda("owner-1", 0),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getPreventiveAgenda("owner-1", 366),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(petFindMany).not.toHaveBeenCalled();
  });
});
