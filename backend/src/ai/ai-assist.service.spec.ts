import { NotFoundException } from "@nestjs/common";
import { AiAssistService } from "./ai-assist.service";

describe("AiAssistService", () => {
  const prisma = {
    pet: {
      findFirst: jest.fn(),
    },
    appointment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  } as any;

  const provider = {
    generateStructured: jest.fn(),
    getModel: jest.fn(() => "gpt-test"),
    isEnabled: jest.fn(() => true),
  } as any;

  let service: AiAssistService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiAssistService(prisma, provider);
  });

  it("short-circuits client emergency signals without calling the LLM", async () => {
    prisma.pet.findFirst.mockResolvedValue({
      id: "pet-1",
      name: "Luna",
      species: "DOG",
      breed: null,
      weight: 12,
      birthDate: null,
      notes: null,
      healthProfile: null,
      healthProfileUpdatedAt: null,
    });
    prisma.appointment.findMany.mockResolvedValue([]);

    const response = await service.clientAssist("user-1", {
      petId: "pet-1",
      question: "Mi perro no puede respirar y está muy débil",
      mode: "CARE_GUIDANCE",
    });

    expect(response.result.urgency).toBe("emergency");
    expect(response.meta.safetyRuleTriggered).toBe(true);
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("uses only the owner's pet context for normal client guidance", async () => {
    prisma.pet.findFirst.mockResolvedValue({
      id: "pet-1",
      name: "Luna",
      species: "DOG",
      breed: "MIXED",
      weight: 12,
      birthDate: null,
      notes: null,
      healthProfile: null,
      healthProfileUpdatedAt: null,
    });
    prisma.appointment.findMany.mockResolvedValue([]);
    provider.generateStructured.mockResolvedValue({
      summary: "Resumen",
      urgency: "soon",
      redFlags: [],
      recommendedActions: ["Solicitar valoración"],
      questionsForVet: [],
      appointmentRecommended: true,
      selfCareBoundary: "No automedicar",
      disclaimer: "Orientación informativa",
    });

    const response = await service.clientAssist("user-1", {
      petId: "pet-1",
      question: "Ha comido menos desde ayer",
      mode: "PRE_VISIT",
    });

    expect(prisma.pet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pet-1", ownerId: "user-1" } }),
    );
    expect(provider.generateStructured).toHaveBeenCalledTimes(1);
    expect(response.meta.provider).toBe("openai");
  });

  it("rejects vet assistance when the appointment is not assigned to the vet", async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);

    await expect(
      service.vetAssist("vet-user-1", {
        appointmentId: "00000000-0000-4000-8000-000000000001",
        question: "Resume el caso",
        mode: "CASE_REVIEW",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(provider.generateStructured).not.toHaveBeenCalled();
  });
});
