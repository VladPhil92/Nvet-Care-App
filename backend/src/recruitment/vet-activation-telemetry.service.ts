import { Injectable } from "@nestjs/common";
import {
  DocumentStatus,
  DocumentType,
  Prisma,
  VerificationStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VetInvitationService } from "./vet-invitation.service";
import { VetOutreachConsentService } from "./vet-outreach-consent.service";
import { VetRecruitmentService } from "./vet-recruitment.service";

const PROGRAM = "vet-activation-telemetry-phase-23";
const REQUIRED_DOCUMENTS = [
  DocumentType.COMVEZCOL_CARD,
  DocumentType.PROFESSIONAL_DEGREE,
  DocumentType.ID_DOCUMENT,
] as const;

const TELEMETRY_USER_SELECT = {
  id: true,
  email: true,
  emailVerified: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  role: true,
  vetProfile: {
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      verifiedAt: true,
      verificationStatus: true,
      isVerified: true,
      isActive: true,
      verificationDocuments: {
        select: {
          type: true,
          status: true,
          uploadedAt: true,
          reviewedAt: true,
        },
      },
      professionalRegistryCheck: {
        select: {
          status: true,
          checkedAt: true,
          updatedAt: true,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

type TelemetryUser = Prisma.UserGetPayload<{
  select: typeof TELEMETRY_USER_SELECT;
}>;
type RecruitmentSnapshot = Awaited<
  ReturnType<VetRecruitmentService["getAdminSnapshot"]>
>;
type RecruitmentLead = RecruitmentSnapshot["leads"][number];
type InvitationSummary = Awaited<
  ReturnType<VetInvitationService["getAdminSummary"]>
>;
type InvitationRecord = InvitationSummary["records"][number];
type ConsentSummary = Awaited<
  ReturnType<VetOutreachConsentService["getAdminSummary"]>
>;
type ConsentStatus = ConsentSummary["permissions"][number];

export type VetActivationRisk =
  | "ON_TRACK"
  | "AT_RISK"
  | "BREACHED"
  | "CRITICAL"
  | "COMPLETE"
  | "PAUSED";

export type VetActivationBlocker =
  | "CONTACT_PERMISSION_REQUIRED"
  | "INVITATION_REQUIRED"
  | "INVITATION_DELIVERY_PENDING"
  | "INVITATION_DELIVERY_FAILED"
  | "INVITATION_REISSUE_REQUIRED"
  | "INVITATION_CLAIM_REQUIRED"
  | "ACCOUNT_LINK_REQUIRED"
  | "ACCOUNT_ROLE_MISMATCH"
  | "ACCOUNT_EMAIL_UNVERIFIED"
  | "ACCOUNT_REGISTERED"
  | "SERVICE_AREA_REQUIRED"
  | "DOCUMENT_REVIEW_REQUIRED"
  | "REGISTRY_CHECK_REQUIRED"
  | "VERIFICATION_APPROVAL_REQUIRED"
  | "PROFILE_INACTIVE"
  | "DATA_CONFLICT"
  | "LEAD_LOST";

type SlaConfig = Partial<Record<VetActivationBlocker, number>>;

type Milestones = {
  leadCreatedAt: string;
  permissionGrantedAt: string | null;
  permissionRevokedAt: string | null;
  invitationIssuedAt: string | null;
  invitationProviderAcceptedAt: string | null;
  invitationClaimedAt: string | null;
  accountCreatedAt: string | null;
  profileCreatedAt: string | null;
  documentsApprovedAt: string | null;
  registryVerifiedAt: string | null;
  verificationApprovedAt: string | null;
  operationalEvidenceAt: string | null;
};

@Injectable()
export class VetActivationTelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recruitment: VetRecruitmentService,
    private readonly invitations: VetInvitationService,
    private readonly outreachConsent: VetOutreachConsentService,
  ) {}

  async getSnapshot(marketDaneCode?: string) {
    const [recruitment, invitations, consents] = await Promise.all([
      this.recruitment.getAdminSnapshot(marketDaneCode),
      this.invitations.getAdminSummary(),
      this.outreachConsent.getAdminSummary(),
    ]);

    const emails = [...new Set(recruitment.leads.map((lead) => lead.email))];
    const users = emails.length
      ? await this.prisma.user.findMany({
          where: { email: { in: emails } },
          select: TELEMETRY_USER_SELECT,
        })
      : [];

    const usersByEmail = new Map(users.map((user) => [user.email, user]));
    const consentByLead = new Map(
      consents.permissions.map((permission) => [permission.leadId, permission]),
    );
    const invitationHistory = new Map<string, InvitationRecord[]>();
    for (const invitation of invitations.records) {
      const history = invitationHistory.get(invitation.leadId) ?? [];
      history.push(invitation);
      invitationHistory.set(invitation.leadId, history);
    }
    const latestInvitationByLead = new Map(
      invitations.latestByLead.map((invitation) => [invitation.leadId, invitation]),
    );

    const now = new Date();
    const sla = this.getSlaConfig();
    const leads = recruitment.leads.map((lead) =>
      this.buildLeadTelemetry({
        lead,
        user: usersByEmail.get(lead.email) ?? null,
        consent: consentByLead.get(lead.leadId) ?? null,
        invitationHistory: invitationHistory.get(lead.leadId) ?? [],
        latestInvitation: latestInvitationByLead.get(lead.leadId) ?? null,
        now,
        sla,
      }),
    );

    const bottlenecks = this.buildBottlenecks(leads);
    const markets = recruitment.markets.map((market) => {
      const marketLeads = leads.filter(
        (lead) => lead.marketDaneCode === market.daneCode,
      );
      const activationDurations = marketLeads
        .map((lead) => lead.durationsHours.leadToOperationalEvidence)
        .filter((value): value is number => value !== null);
      return {
        ...market,
        onTrack: marketLeads.filter((lead) => lead.risk === "ON_TRACK").length,
        atRisk: marketLeads.filter((lead) => lead.risk === "AT_RISK").length,
        breached: marketLeads.filter((lead) => lead.risk === "BREACHED").length,
        critical: marketLeads.filter((lead) => lead.risk === "CRITICAL").length,
        medianLeadToOperationalEvidenceHours:
          this.median(activationDurations),
      } as const;
    });

    const operationalDurations = leads
      .map((lead) => lead.durationsHours.leadToOperationalEvidence)
      .filter((value): value is number => value !== null);
    const actionable = leads.filter(
      (lead) => !["COMPLETE", "PAUSED"].includes(lead.risk),
    );
    const priorityQueue = [...actionable].sort((a, b) => {
      const riskDelta = this.riskWeight(b.risk) - this.riskWeight(a.risk);
      if (riskDelta !== 0) return riskDelta;
      return b.blockerAgeHours - a.blockerAgeHours;
    });

    return {
      phase: 23,
      program: PROGRAM,
      measurementMode: "read-only-observability",
      commercialLaunchAuthorized: false,
      operationalSupplySource: recruitment.operationalSupplySource,
      leadPresenceNeverCountsAsCoverage: true,
      slaPolicy: {
        timezone: "America/Bogota",
        configurableByEnvironment: true,
        atRiskThresholdRatio: 0.75,
        hours: sla,
      },
      totals: {
        leads: leads.length,
        operationalReady: leads.filter((lead) => lead.risk === "COMPLETE")
          .length,
        onTrack: leads.filter((lead) => lead.risk === "ON_TRACK").length,
        atRisk: leads.filter((lead) => lead.risk === "AT_RISK").length,
        breached: leads.filter((lead) => lead.risk === "BREACHED").length,
        critical: leads.filter((lead) => lead.risk === "CRITICAL").length,
        paused: leads.filter((lead) => lead.risk === "PAUSED").length,
        medianLeadToOperationalEvidenceHours:
          this.median(operationalDurations),
      },
      funnel: {
        leadCreated: leads.length,
        permissionEverGranted: leads.filter(
          (lead) => lead.milestones.permissionGrantedAt,
        ).length,
        invitationProviderAccepted: leads.filter(
          (lead) => lead.milestones.invitationProviderAcceptedAt,
        ).length,
        invitationClaimed: leads.filter(
          (lead) => lead.milestones.invitationClaimedAt,
        ).length,
        accountLinked: leads.filter((lead) => lead.milestones.accountCreatedAt)
          .length,
        profileCreated: leads.filter((lead) => lead.milestones.profileCreatedAt)
          .length,
        documentsApproved: leads.filter(
          (lead) => lead.milestones.documentsApprovedAt,
        ).length,
        registryVerified: leads.filter(
          (lead) => lead.milestones.registryVerifiedAt,
        ).length,
        verificationApproved: leads.filter(
          (lead) => lead.milestones.verificationApprovedAt,
        ).length,
        operationalReady: leads.filter((lead) => lead.risk === "COMPLETE")
          .length,
      },
      bottlenecks,
      markets,
      priorityQueue,
      leads,
      evidenceNotes: [
        "Invitation, consent, account, profile, document, registry and verification timestamps are derived from durable application records.",
        "Operational readiness is a current-state assertion. operationalEvidenceAt is a lower-bound evidence timestamp built from durable prerequisites, not a guaranteed historical first-ready timestamp.",
        "SLA metrics are operational management signals only; they do not relax veterinarian verification, coverage or financial controls.",
      ],
      generatedAt: now.toISOString(),
    } as const;
  }

  private buildLeadTelemetry(params: {
    lead: RecruitmentLead;
    user: TelemetryUser | null;
    consent: ConsentStatus | null;
    invitationHistory: InvitationRecord[];
    latestInvitation: InvitationRecord | null;
    now: Date;
    sla: SlaConfig;
  }) {
    const {
      lead,
      user,
      consent,
      invitationHistory,
      latestInvitation,
      now,
      sla,
    } = params;
    const firstAcceptedInvitation = [...invitationHistory]
      .filter((invitation) => invitation.providerAcceptedAt)
      .sort(
        (a, b) =>
          Date.parse(a.providerAcceptedAt!) - Date.parse(b.providerAcceptedAt!),
      )[0];
    const firstClaimedInvitation = [...invitationHistory]
      .filter((invitation) => invitation.claimedAt)
      .sort(
        (a, b) => Date.parse(a.claimedAt!) - Date.parse(b.claimedAt!),
      )[0];
    const firstIssuedInvitation = [...invitationHistory].sort(
      (a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt),
    )[0];

    const documentsApprovedAt = this.getDocumentsApprovedAt(user);
    const registryVerifiedAt = this.getRegistryVerifiedAt(user);
    const verificationApprovedAt = this.getVerificationApprovedAt(user);
    const operationalEvidenceAt =
      lead.conversionStage === "OPERATIONAL_READY"
        ? this.latestTimestamp([
            user?.createdAt ?? null,
            user?.vetProfile?.createdAt ?? null,
            documentsApprovedAt,
            registryVerifiedAt,
            verificationApprovedAt,
          ])
        : null;
    const milestones: Milestones = {
      leadCreatedAt: lead.createdAt,
      permissionGrantedAt: consent?.grantedAt ?? null,
      permissionRevokedAt: consent?.revokedAt ?? null,
      invitationIssuedAt: firstIssuedInvitation?.issuedAt ?? null,
      invitationProviderAcceptedAt:
        firstAcceptedInvitation?.providerAcceptedAt ?? null,
      invitationClaimedAt: firstClaimedInvitation?.claimedAt ?? null,
      accountCreatedAt: user?.createdAt.toISOString() ?? null,
      profileCreatedAt: user?.vetProfile?.createdAt.toISOString() ?? null,
      documentsApprovedAt,
      registryVerifiedAt,
      verificationApprovedAt,
      operationalEvidenceAt,
    };

    const blocker = this.resolveBlocker({
      lead,
      consent,
      latestInvitation,
      user,
      milestones,
    });
    const blockerSince = this.resolveBlockerSince(blocker, milestones, user);
    const blockerAgeHours = blockerSince
      ? this.elapsedHours(blockerSince, now.toISOString())
      : 0;
    const blockerSlaHours = blocker ? (sla[blocker] ?? null) : null;
    const risk = this.resolveRisk({
      lead,
      blocker,
      blockerAgeHours,
      blockerSlaHours,
    });

    return {
      leadId: lead.leadId,
      fullName: lead.fullName,
      email: lead.email,
      marketDaneCode: lead.marketDaneCode,
      market: lead.market,
      outreachStage: lead.stage,
      conversionStage: lead.conversionStage,
      currentBlocker: blocker,
      risk,
      blockerSince,
      blockerAgeHours: this.round(blockerAgeHours),
      blockerSlaHours,
      slaRemainingHours:
        blockerSlaHours === null
          ? null
          : this.round(blockerSlaHours - blockerAgeHours),
      slaProgressRatio:
        blockerSlaHours === null || blockerSlaHours === 0
          ? null
          : this.round(blockerAgeHours / blockerSlaHours, 3),
      nextAction: lead.nextAction,
      milestones,
      durationsHours: {
        leadToPermission: this.duration(
          milestones.leadCreatedAt,
          milestones.permissionGrantedAt,
        ),
        permissionToInvitation: this.duration(
          milestones.permissionGrantedAt,
          milestones.invitationProviderAcceptedAt,
        ),
        invitationToClaim: this.duration(
          milestones.invitationProviderAcceptedAt,
          milestones.invitationClaimedAt,
        ),
        accountToProfile: this.duration(
          milestones.accountCreatedAt,
          milestones.profileCreatedAt,
        ),
        profileToDocumentsApproved: this.duration(
          milestones.profileCreatedAt,
          milestones.documentsApprovedAt,
        ),
        documentsToRegistry: this.duration(
          milestones.documentsApprovedAt,
          milestones.registryVerifiedAt,
        ),
        registryToVerification: this.duration(
          milestones.registryVerifiedAt,
          milestones.verificationApprovedAt,
        ),
        leadToOperationalEvidence: this.duration(
          milestones.leadCreatedAt,
          milestones.operationalEvidenceAt,
        ),
      },
    } as const;
  }

  private resolveBlocker(params: {
    lead: RecruitmentLead;
    consent: ConsentStatus | null;
    latestInvitation: InvitationRecord | null;
    user: TelemetryUser | null;
    milestones: Milestones;
  }): VetActivationBlocker | null {
    const { lead, consent, latestInvitation, user } = params;
    if (lead.conflicted) return "DATA_CONFLICT";
    if (lead.stage === "LOST") return "LEAD_LOST";
    if (lead.conversionStage === "OPERATIONAL_READY") return null;

    if (lead.conversionStage === "LEAD_ONLY") {
      if (!consent?.contactAllowed && !latestInvitation?.providerAcceptedAt) {
        return "CONTACT_PERMISSION_REQUIRED";
      }
      if (!latestInvitation) return "INVITATION_REQUIRED";
      if (latestInvitation.status === "SEND_FAILED") {
        return "INVITATION_DELIVERY_FAILED";
      }
      if (latestInvitation.status === "PENDING") {
        return "INVITATION_DELIVERY_PENDING";
      }
      if (
        ["EXPIRED", "SUPERSEDED"].includes(latestInvitation.status) &&
        !latestInvitation.claimedAt
      ) {
        return "INVITATION_REISSUE_REQUIRED";
      }
      if (latestInvitation.status === "ACTIVE") {
        return "INVITATION_CLAIM_REQUIRED";
      }
      if (latestInvitation.status === "CLAIMED" && !user) {
        return "ACCOUNT_LINK_REQUIRED";
      }
      return "INVITATION_REQUIRED";
    }

    switch (lead.conversionStage) {
      case "ACCOUNT_ROLE_MISMATCH":
        return "ACCOUNT_ROLE_MISMATCH";
      case "ACCOUNT_EMAIL_UNVERIFIED":
        return "ACCOUNT_EMAIL_UNVERIFIED";
      case "ACCOUNT_REGISTERED":
        return "ACCOUNT_REGISTERED";
      case "SERVICE_AREA_REQUIRED":
        return "SERVICE_AREA_REQUIRED";
      case "DOCUMENT_REVIEW_REQUIRED":
        return "DOCUMENT_REVIEW_REQUIRED";
      case "REGISTRY_CHECK_REQUIRED":
        return "REGISTRY_CHECK_REQUIRED";
      case "VERIFICATION_APPROVAL_REQUIRED":
        return "VERIFICATION_APPROVAL_REQUIRED";
      case "PROFILE_INACTIVE":
        return "PROFILE_INACTIVE";
      default:
        return "DATA_CONFLICT";
    }
  }

  private resolveBlockerSince(
    blocker: VetActivationBlocker | null,
    milestones: Milestones,
    user: TelemetryUser | null,
  ): string | null {
    switch (blocker) {
      case null:
      case "LEAD_LOST":
        return null;
      case "CONTACT_PERMISSION_REQUIRED":
        return milestones.leadCreatedAt;
      case "INVITATION_REQUIRED":
        return milestones.permissionGrantedAt ?? milestones.leadCreatedAt;
      case "INVITATION_DELIVERY_PENDING":
      case "INVITATION_DELIVERY_FAILED":
      case "INVITATION_REISSUE_REQUIRED":
      case "INVITATION_CLAIM_REQUIRED":
      case "ACCOUNT_LINK_REQUIRED":
        return (
          milestones.invitationProviderAcceptedAt ??
          milestones.invitationIssuedAt ??
          milestones.permissionGrantedAt ??
          milestones.leadCreatedAt
        );
      case "ACCOUNT_ROLE_MISMATCH":
      case "ACCOUNT_EMAIL_UNVERIFIED":
      case "ACCOUNT_REGISTERED":
        return milestones.accountCreatedAt ?? milestones.leadCreatedAt;
      case "SERVICE_AREA_REQUIRED":
        return (
          user?.vetProfile?.updatedAt.toISOString() ??
          milestones.profileCreatedAt ??
          milestones.accountCreatedAt
        );
      case "DOCUMENT_REVIEW_REQUIRED":
        return (
          this.latestDocumentActivityAt(user) ??
          milestones.profileCreatedAt ??
          milestones.accountCreatedAt
        );
      case "REGISTRY_CHECK_REQUIRED":
        return (
          milestones.documentsApprovedAt ??
          milestones.profileCreatedAt ??
          milestones.accountCreatedAt
        );
      case "VERIFICATION_APPROVAL_REQUIRED":
        return (
          milestones.registryVerifiedAt ??
          milestones.documentsApprovedAt ??
          milestones.profileCreatedAt
        );
      case "PROFILE_INACTIVE":
        return (
          milestones.verificationApprovedAt ??
          user?.vetProfile?.updatedAt.toISOString() ??
          milestones.profileCreatedAt
        );
      case "DATA_CONFLICT":
        return milestones.leadCreatedAt;
    }
  }

  private resolveRisk(params: {
    lead: RecruitmentLead;
    blocker: VetActivationBlocker | null;
    blockerAgeHours: number;
    blockerSlaHours: number | null;
  }): VetActivationRisk {
    const { lead, blocker, blockerAgeHours, blockerSlaHours } = params;
    if (lead.stage === "LOST") return "PAUSED";
    if (!blocker) return "COMPLETE";
    if (
      [
        "DATA_CONFLICT",
        "ACCOUNT_ROLE_MISMATCH",
        "ACCOUNT_LINK_REQUIRED",
        "INVITATION_DELIVERY_FAILED",
      ].includes(blocker)
    ) {
      return "CRITICAL";
    }
    if (blockerSlaHours === null) return "ON_TRACK";
    if (blockerAgeHours >= blockerSlaHours) return "BREACHED";
    if (blockerAgeHours / blockerSlaHours >= 0.75) return "AT_RISK";
    return "ON_TRACK";
  }

  private getDocumentsApprovedAt(user: TelemetryUser | null): string | null {
    const documents = user?.vetProfile?.verificationDocuments ?? [];
    const approvedAt: Date[] = [];
    for (const type of REQUIRED_DOCUMENTS) {
      const approved = documents
        .filter(
          (document) =>
            document.type === type && document.status === DocumentStatus.APPROVED,
        )
        .map((document) => document.reviewedAt ?? document.uploadedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      if (!approved) return null;
      approvedAt.push(approved);
    }
    return this.latestTimestamp(approvedAt);
  }

  private latestDocumentActivityAt(user: TelemetryUser | null): string | null {
    return this.latestTimestamp(
      (user?.vetProfile?.verificationDocuments ?? []).flatMap((document) => [
        document.uploadedAt,
        document.reviewedAt,
      ]),
    );
  }

  private getRegistryVerifiedAt(user: TelemetryUser | null): string | null {
    const registry = user?.vetProfile?.professionalRegistryCheck;
    if (!registry || registry.status !== "VERIFIED") return null;
    return registry.checkedAt.toISOString();
  }

  private getVerificationApprovedAt(user: TelemetryUser | null): string | null {
    const profile = user?.vetProfile;
    if (
      !profile ||
      profile.verificationStatus !== VerificationStatus.APPROVED ||
      !profile.isVerified
    ) {
      return null;
    }
    return profile.verifiedAt?.toISOString() ?? null;
  }

  private buildBottlenecks(
    leads: Array<{
      currentBlocker: VetActivationBlocker | null;
      risk: VetActivationRisk;
      blockerAgeHours: number;
    }>,
  ) {
    const grouped = new Map<
      VetActivationBlocker,
      {
        blocker: VetActivationBlocker;
        count: number;
        breachedOrCritical: number;
        oldestHours: number;
      }
    >();
    for (const lead of leads) {
      if (!lead.currentBlocker || lead.currentBlocker === "LEAD_LOST") continue;
      const current = grouped.get(lead.currentBlocker) ?? {
        blocker: lead.currentBlocker,
        count: 0,
        breachedOrCritical: 0,
        oldestHours: 0,
      };
      current.count += 1;
      if (["BREACHED", "CRITICAL"].includes(lead.risk)) {
        current.breachedOrCritical += 1;
      }
      current.oldestHours = Math.max(
        current.oldestHours,
        lead.blockerAgeHours,
      );
      grouped.set(lead.currentBlocker, current);
    }
    return [...grouped.values()].sort(
      (a, b) =>
        b.breachedOrCritical - a.breachedOrCritical ||
        b.count - a.count ||
        b.oldestHours - a.oldestHours,
    );
  }

  private getSlaConfig(): SlaConfig {
    return {
      CONTACT_PERMISSION_REQUIRED: this.readHours(
        "NVET_SLA_CONTACT_PERMISSION_HOURS",
        24,
      ),
      INVITATION_REQUIRED: this.readHours("NVET_SLA_INVITATION_HOURS", 24),
      INVITATION_DELIVERY_PENDING: this.readHours(
        "NVET_SLA_INVITATION_DELIVERY_HOURS",
        1,
      ),
      INVITATION_REISSUE_REQUIRED: this.readHours(
        "NVET_SLA_INVITATION_REISSUE_HOURS",
        4,
      ),
      INVITATION_CLAIM_REQUIRED: this.readHours(
        "NVET_SLA_INVITATION_CLAIM_HOURS",
        72,
      ),
      ACCOUNT_EMAIL_UNVERIFIED: this.readHours(
        "NVET_SLA_EMAIL_VERIFICATION_HOURS",
        24,
      ),
      ACCOUNT_REGISTERED: this.readHours(
        "NVET_SLA_PROFILE_CREATION_HOURS",
        24,
      ),
      SERVICE_AREA_REQUIRED: this.readHours(
        "NVET_SLA_SERVICE_AREA_HOURS",
        24,
      ),
      DOCUMENT_REVIEW_REQUIRED: this.readHours(
        "NVET_SLA_DOCUMENT_REVIEW_HOURS",
        72,
      ),
      REGISTRY_CHECK_REQUIRED: this.readHours(
        "NVET_SLA_REGISTRY_CHECK_HOURS",
        48,
      ),
      VERIFICATION_APPROVAL_REQUIRED: this.readHours(
        "NVET_SLA_VERIFICATION_APPROVAL_HOURS",
        24,
      ),
      PROFILE_INACTIVE: this.readHours(
        "NVET_SLA_PROFILE_REACTIVATION_HOURS",
        24,
      ),
    };
  }

  private readHours(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private duration(start: string | null, end: string | null): number | null {
    if (!start || !end) return null;
    const value = this.elapsedHours(start, end);
    return value >= 0 ? this.round(value) : null;
  }

  private elapsedHours(start: string, end: string): number {
    return Math.max(0, (Date.parse(end) - Date.parse(start)) / 3_600_000);
  }

  private latestTimestamp(
    values: Array<Date | string | null | undefined>,
  ): string | null {
    const timestamps = values
      .filter((value): value is Date | string => Boolean(value))
      .map((value) => (value instanceof Date ? value : new Date(value)))
      .filter((value) => Number.isFinite(value.getTime()));
    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps.map((value) => value.getTime()))).toISOString();
  }

  private median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const midpoint = Math.floor(sorted.length / 2);
    const value =
      sorted.length % 2 === 0
        ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
        : sorted[midpoint];
    return this.round(value);
  }

  private riskWeight(risk: VetActivationRisk): number {
    return {
      CRITICAL: 5,
      BREACHED: 4,
      AT_RISK: 3,
      ON_TRACK: 2,
      PAUSED: 1,
      COMPLETE: 0,
    }[risk];
  }

  private round(value: number, digits = 1): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}
