import {
  DocumentStatus,
  DocumentType,
  UserRole,
  VerificationStatus,
} from "@prisma/client";
import { VetActivationTelemetryService } from "./vet-activation-telemetry.service";

describe("VetActivationTelemetryService", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const recruitment = { getAdminSnapshot: jest.fn() } as any;
  const invitations = { getAdminSummary: jest.fn() } as any;
  const outreachConsent = { getAdminSummary: jest.fn() } as any;
  const prisma = { user: { findMany: jest.fn() } } as any;
  let service: VetActivationTelemetryService;

  const baseLead = {
    leadId: "lead-1",
    fullName: "Ana Veterinaria",
    email: "ana@example.com",
    phone: "+573001234567",
    marketDaneCode: "13001",
    source: "manual",
    stage: "NEW",
    nextFollowUpAt: null,
    createdAt: "2026-09-09T06:00:00.000Z",
    lastEventAt: "2026-09-09T06:00:00.000Z",
    eventCount: 1,
    conflicted: false,
    conflictReasons: [] as string[],
    linkedUserId: null as string | null,
    conversionStage: "LEAD_ONLY",
    nextAction: "Contact candidate",
    followUpDue: false,
    market: {
      code: "CTG",
      daneCode: "13001",
      city: "Cartagena de Indias",
      department: "Bolívar",
    },
  };

  const market = {
    code: "CTG",
    daneCode: "13001",
    city: "Cartagena de Indias",
    department: "Bolívar",
    leads: 1,
    activeLeads: 1,
    new: 1,
    contacted: 0,
    interested: 0,
    invited: 0,
    lost: 0,
    registeredAccounts: 0,
    operationalReadyFromCrm: 0,
    totalOperationalSupply: 0,
    minimumOperationalVets: 3,
    coverageGap: 3,
    supplyReady: false,
  } as const;

  const setRecruitment = (lead = baseLead) => {
    recruitment.getAdminSnapshot.mockResolvedValue({
      phase: 20,
      program: "vet-recruitment-crm-phase-20",
      operationalSupplySource: "GET /api/coverage/supply-funnel",
      leads: [lead],
      markets: [market],
    });
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    service = new VetActivationTelemetryService(
      prisma,
      recruitment,
      invitations,
      outreachConsent,
    );
    setRecruitment();
    invitations.getAdminSummary.mockResolvedValue({ latestByLead: [] });
    outreachConsent.getAdminSummary.mockResolvedValue({ permissions: [] });
    prisma.user.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("marks an aging lead without contact permission as breached", async () => {
    const snapshot = await service.getSnapshot("13001");

    expect(snapshot.leads[0].currentBlocker).toBe(
      "CONTACT_PERMISSION_REQUIRED",
    );
    expect(snapshot.leads[0].risk).toBe("BREACHED");
    expect(snapshot.leads[0].blockerAgeHours).toBe(30);
    expect(snapshot.leads[0].blockerSlaHours).toBe(24);
    expect(snapshot.totals.breached).toBe(1);
    expect(snapshot.bottlenecks[0]).toEqual(
      expect.objectContaining({
        blocker: "CONTACT_PERMISSION_REQUIRED",
        breachedOrCritical: 1,
      }),
    );
  });

  it("tracks an authorized lead waiting for invitation as on track", async () => {
    outreachConsent.getAdminSummary.mockResolvedValue({
      permissions: [
        {
          leadId: "lead-1",
          state: "ACTIVE",
          contactAllowed: true,
          grantedAt: "2026-09-10T06:00:00.000Z",
          revokedAt: null,
        },
      ],
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.leads[0].currentBlocker).toBe("INVITATION_REQUIRED");
    expect(snapshot.leads[0].risk).toBe("ON_TRACK");
    expect(snapshot.leads[0].blockerAgeHours).toBe(6);
    expect(snapshot.funnel.permissionEverGranted).toBe(1);
  });

  it("marks an active invitation near its claim SLA as at risk", async () => {
    outreachConsent.getAdminSummary.mockResolvedValue({
      permissions: [
        {
          leadId: "lead-1",
          state: "ACTIVE",
          contactAllowed: true,
          grantedAt: "2026-09-07T20:00:00.000Z",
          revokedAt: null,
        },
      ],
    });
    invitations.getAdminSummary.mockResolvedValue({
      latestByLead: [
        {
          invitationId: "invite-1",
          leadId: "lead-1",
          status: "ACTIVE",
          issuedAt: "2026-09-08T00:00:00.000Z",
          providerAcceptedAt: "2026-09-08T00:00:00.000Z",
          claimedAt: null,
        },
      ],
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.leads[0].currentBlocker).toBe(
      "INVITATION_CLAIM_REQUIRED",
    );
    expect(snapshot.leads[0].risk).toBe("AT_RISK");
    expect(snapshot.leads[0].blockerAgeHours).toBe(60);
    expect(snapshot.leads[0].slaProgressRatio).toBeCloseTo(0.833, 3);
    expect(snapshot.funnel.invitationProviderAccepted).toBe(1);
  });

  it("reports verified operational supply as complete with milestone evidence", async () => {
    const operationalLead = {
      ...baseLead,
      stage: "INVITED",
      linkedUserId: "vet-user-1",
      conversionStage: "OPERATIONAL_READY",
      nextAction: "Maintain availability",
    };
    setRecruitment(operationalLead);
    prisma.user.findMany.mockResolvedValue([
      {
        id: "vet-user-1",
        email: "ana@example.com",
        emailVerified: true,
        isActive: true,
        role: UserRole.VET,
        createdAt: new Date("2026-09-09T10:00:00.000Z"),
        updatedAt: new Date("2026-09-09T10:00:00.000Z"),
        vetProfile: {
          id: "profile-1",
          createdAt: new Date("2026-09-09T12:00:00.000Z"),
          updatedAt: new Date("2026-09-10T02:00:00.000Z"),
          verifiedAt: new Date("2026-09-10T02:00:00.000Z"),
          verificationStatus: VerificationStatus.APPROVED,
          isVerified: true,
          isActive: true,
          verificationDocuments: [
            DocumentType.COMVEZCOL_CARD,
            DocumentType.PROFESSIONAL_DEGREE,
            DocumentType.ID_DOCUMENT,
          ].map((type, index) => ({
            type,
            status: DocumentStatus.APPROVED,
            uploadedAt: new Date(`2026-09-09T1${3 + index}:00:00.000Z`),
            reviewedAt: new Date(`2026-09-09T1${6 + index}:00:00.000Z`),
          })),
          professionalRegistryCheck: {
            status: "VERIFIED",
            checkedAt: new Date("2026-09-09T20:00:00.000Z"),
            updatedAt: new Date("2026-09-09T20:00:00.000Z"),
          },
        },
      },
    ]);

    const snapshot = await service.getSnapshot();

    expect(snapshot.leads[0].risk).toBe("COMPLETE");
    expect(snapshot.leads[0].currentBlocker).toBeNull();
    expect(snapshot.leads[0].milestones.documentsApprovedAt).not.toBeNull();
    expect(snapshot.leads[0].milestones.registryVerifiedAt).toBe(
      "2026-09-09T20:00:00.000Z",
    );
    expect(snapshot.leads[0].milestones.verificationApprovedAt).toBe(
      "2026-09-10T02:00:00.000Z",
    );
    expect(snapshot.totals.operationalReady).toBe(1);
    expect(snapshot.funnel.operationalReady).toBe(1);
  });

  it("pauses lost leads instead of treating them as SLA failures", async () => {
    setRecruitment({ ...baseLead, stage: "LOST" });

    const snapshot = await service.getSnapshot();

    expect(snapshot.leads[0].currentBlocker).toBe("LEAD_LOST");
    expect(snapshot.leads[0].risk).toBe("PAUSED");
    expect(snapshot.totals.paused).toBe(1);
  });
});
