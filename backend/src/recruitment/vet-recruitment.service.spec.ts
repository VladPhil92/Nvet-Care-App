import {
  DocumentStatus,
  DocumentType,
  UserRole,
  VerificationStatus,
} from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { VetRecruitmentService } from "./vet-recruitment.service";

describe("VetRecruitmentService", () => {
  const rows: Array<{
    targetId: string;
    createdAt: Date;
    metadata: unknown;
  }> = [];
  let sequence = 0;

  const prisma = {
    auditLog: {
      create: jest.fn(async ({ data }) => {
        sequence += 1;
        rows.push({
          targetId: data.targetId,
          createdAt: new Date(`2026-09-10T04:${String(sequence).padStart(2, "0")}:00Z`),
          metadata: data.metadata,
        });
        return data;
      }),
      findMany: jest.fn(async ({ where }) =>
        rows.filter(
          (row) => !where.targetId || row.targetId === where.targetId,
        ),
      ),
    },
    user: {
      findMany: jest.fn(),
    },
  } as any;

  const coverage = {
    isVetServiceAreaConsistent: jest.fn(() => true),
  } as any;

  const supply = {
    getSupplyFunnelSnapshot: jest.fn(),
  } as any;

  const actor = {
    id: "admin-id",
    role: UserRole.ADMIN,
  };

  let service: VetRecruitmentService;

  beforeEach(() => {
    rows.length = 0;
    sequence = 0;
    jest.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([]);
    supply.getSupplyFunnelSnapshot.mockResolvedValue({
      markets: [
        {
          daneCode: "13001",
          operationalGeoReady: 1,
          minimumOperationalVets: 3,
          coverageGap: 2,
          supplyReady: false,
        },
      ],
    });
    coverage.isVetServiceAreaConsistent.mockReturnValue(true);
    service = new VetRecruitmentService(prisma, coverage, supply);
  });

  it("creates a normalized lead without counting it as operational supply", async () => {
    const lead = await service.createLead(
      {
        fullName: "  Ana Veterinaria  ",
        email: "ANA@EXAMPLE.COM",
        phone: "+573001112233",
        marketDaneCode: "13001",
        source: "referral",
      },
      actor,
    );

    expect(lead.email).toBe("ana@example.com");
    expect(lead.fullName).toBe("Ana Veterinaria");
    expect(lead.stage).toBe("NEW");
    expect(lead.conversionStage).toBe("LEAD_ONLY");

    const snapshot = await service.getAdminSnapshot("13001");
    expect(snapshot.leadPresenceNeverCountsAsCoverage).toBe(true);
    expect(snapshot.markets[0].leads).toBe(1);
    expect(snapshot.markets[0].totalOperationalSupply).toBe(1);
    expect(snapshot.markets[0].coverageGap).toBe(2);
  });

  it("prevents duplicate lead streams for the same normalized email", async () => {
    await service.createLead(
      {
        fullName: "Ana Veterinaria",
        email: "ana@example.com",
        marketDaneCode: "13001",
      },
      actor,
    );

    await expect(
      service.createLead(
        {
          fullName: "Ana V.",
          email: "ANA@example.com",
          marketDaneCode: "13001",
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("tracks outreach stages independently from real account conversion", async () => {
    const lead = await service.createLead(
      {
        fullName: "Ana Veterinaria",
        email: "ana@example.com",
        marketDaneCode: "13001",
      },
      actor,
    );

    const contacted = await service.updateStage(
      lead.leadId,
      { stage: "CONTACTED" },
      actor,
    );
    const invited = await service.updateStage(
      lead.leadId,
      { stage: "INVITED" },
      actor,
    );

    expect(contacted.stage).toBe("CONTACTED");
    expect(invited.stage).toBe("INVITED");
    expect(invited.conversionStage).toBe("LEAD_ONLY");
    expect(rows).toHaveLength(3);
  });

  it("reconciles an existing fully verified VET account as operational-ready", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: "vet-user-id",
        email: "ana@example.com",
        emailVerified: true,
        isActive: true,
        role: UserRole.VET,
        vetProfile: {
          city: "Cartagena de Indias",
          department: "Bolívar",
          latitude: 10.4,
          longitude: -75.5,
          serviceRadius: 10,
          verificationStatus: VerificationStatus.APPROVED,
          isVerified: true,
          isActive: true,
          verificationDocuments: [
            {
              type: DocumentType.COMVEZCOL_CARD,
              status: DocumentStatus.APPROVED,
            },
            {
              type: DocumentType.PROFESSIONAL_DEGREE,
              status: DocumentStatus.APPROVED,
            },
            {
              type: DocumentType.ID_DOCUMENT,
              status: DocumentStatus.APPROVED,
            },
          ],
          professionalRegistryCheck: { status: "VERIFIED" },
        },
      },
    ]);

    const lead = await service.createLead(
      {
        fullName: "Ana Veterinaria",
        email: "ana@example.com",
        marketDaneCode: "13001",
      },
      actor,
    );

    expect(lead.linkedUserId).toBe("vet-user-id");
    expect(lead.conversionStage).toBe("OPERATIONAL_READY");
  });
});
