import {
  DocumentStatus,
  DocumentType,
  VerificationStatus,
} from "@prisma/client";
import { CartagenaVetActivationService } from "./cartagena-vet-activation.service";

const now = new Date("2026-09-10T00:00:00.000Z");

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "vet-1",
    userId: "user-1",
    licenseNumber: "12345-6",
    comvezcolNumber: "12345-6",
    city: "Cartagena de Indias",
    department: "Bolívar",
    latitude: 10.391,
    longitude: -75.479,
    serviceRadius: 15,
    verificationStatus: VerificationStatus.APPROVED,
    isVerified: true,
    isActive: true,
    verifiedAt: now,
    updatedAt: now,
    user: {
      firstName: "Ana",
      lastName: "Vet",
      email: "ana@example.test",
    },
    verificationDocuments: [
      {
        id: "doc-1",
        type: DocumentType.COMVEZCOL_CARD,
        status: DocumentStatus.APPROVED,
        fileName: "card.pdf",
        uploadedAt: now,
        reviewedAt: now,
        reviewNotes: null,
      },
      {
        id: "doc-2",
        type: DocumentType.PROFESSIONAL_DEGREE,
        status: DocumentStatus.APPROVED,
        fileName: "degree.pdf",
        uploadedAt: now,
        reviewedAt: now,
        reviewNotes: null,
      },
      {
        id: "doc-3",
        type: DocumentType.ID_DOCUMENT,
        status: DocumentStatus.APPROVED,
        fileName: "id.pdf",
        uploadedAt: now,
        reviewedAt: now,
        reviewNotes: null,
      },
    ],
    professionalRegistryCheck: {
      status: "VERIFIED",
      checkedAt: now,
      sourceUrl: "https://consejoprofesionalmvz.gov.co/consulta-de-profesionales/",
    },
    ...overrides,
  };
}

describe("CartagenaVetActivationService", () => {
  const coverage = {
    resolveMarketByCity: jest.fn((city?: string | null) =>
      city?.toLowerCase().includes("cartagena")
        ? { daneCode: "13001" }
        : city?.toLowerCase().includes("bogot")
          ? { daneCode: "11001" }
          : null,
    ),
    isVetServiceAreaConsistent: jest.fn(
      (vet: { city?: string | null; latitude?: number | null }) =>
        Boolean(
          vet.city?.toLowerCase().includes("cartagena") &&
            vet.latitude != null &&
            vet.latitude < 11,
        ),
    ),
  };

  beforeEach(() => jest.clearAllMocks());

  it("becomes formal-evidence eligible only with three operational Cartagena vets", async () => {
    const prisma = {
      vetProfile: {
        findMany: jest.fn().mockResolvedValue([
          profile({ id: "vet-1", userId: "user-1" }),
          profile({ id: "vet-2", userId: "user-2" }),
          profile({ id: "vet-3", userId: "user-3" }),
        ]),
      },
    };
    const service = new CartagenaVetActivationService(
      prisma as never,
      coverage as never,
    );

    const snapshot = await service.getSnapshot();

    expect(snapshot.operationalReady).toBe(3);
    expect(snapshot.coverageGap).toBe(0);
    expect(snapshot.supplyActivationReady).toBe(true);
    expect(snapshot.formalEvidence.eligible).toBe(true);
    expect(snapshot.formalEvidence.gateId).toBe("cartagena-vet-coverage");
    expect(snapshot.formalEvidence.submissionMustRemainManual).toBe(true);
  });

  it("fails closed when an approved vet has a city/coordinate mismatch", async () => {
    const prisma = {
      vetProfile: {
        findMany: jest.fn().mockResolvedValue([
          profile({ latitude: 4.711 }),
        ]),
      },
    };
    const service = new CartagenaVetActivationService(
      prisma as never,
      coverage as never,
    );

    const snapshot = await service.getSnapshot();

    expect(snapshot.operationalReady).toBe(0);
    expect(snapshot.coverageGap).toBe(3);
    expect(snapshot.candidates[0].blockers).toContain("SERVICE_AREA_MISMATCH");
    expect(snapshot.formalEvidence.eligible).toBe(false);
  });

  it("prioritizes documentary review before registry activation", async () => {
    const documents = profile().verificationDocuments.map((document, index) =>
      index === 0
        ? { ...document, status: DocumentStatus.UPLOADED, reviewedAt: null }
        : document,
    );
    const prisma = {
      vetProfile: {
        findMany: jest.fn().mockResolvedValue([
          profile({
            verificationStatus: VerificationStatus.IN_REVIEW,
            isVerified: false,
            isActive: false,
            verificationDocuments: documents,
            professionalRegistryCheck: null,
          }),
        ]),
      },
    };
    const service = new CartagenaVetActivationService(
      prisma as never,
      coverage as never,
    );

    const snapshot = await service.getSnapshot();
    const candidate = snapshot.candidates[0];

    expect(candidate.nextAction).toBe("DOCUMENT_REVIEW_REQUIRED");
    expect(candidate.blockers).toContain("REGISTRY_CHECK_REQUIRED");
    expect(candidate.operationalReady).toBe(false);
  });
});
