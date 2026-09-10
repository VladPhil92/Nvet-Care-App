import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  AuditAction,
  AuditSeverity,
  DocumentStatus,
  DocumentType,
  Prisma,
  UserRole,
  VerificationStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { CoverageService } from "../coverage/coverage.service";
import {
  COLOMBIA_LAUNCH_MARKETS,
  MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
} from "../coverage/coverage.constants";
import { VetSupplyReadinessService } from "../coverage/vet-supply-readiness.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateVetRecruitmentLeadDto,
  ScheduleVetRecruitmentFollowUpDto,
  UpdateVetRecruitmentStageDto,
  VetRecruitmentStage,
} from "./dto/vet-recruitment.dto";

const PROGRAM = "vet-recruitment-crm-phase-20";
const TARGET_TYPE = "VET_RECRUITMENT_LEAD";
const MAX_EVENT_ROWS = 5000;
const REQUIRED_DOCUMENTS = [
  DocumentType.COMVEZCOL_CARD,
  DocumentType.PROFESSIONAL_DEGREE,
  DocumentType.ID_DOCUMENT,
] as const;

const STAGE_RANK: Record<Exclude<VetRecruitmentStage, "LOST">, number> = {
  NEW: 0,
  CONTACTED: 1,
  INTERESTED: 2,
  INVITED: 3,
};

type RecruitmentEventType = "CREATED" | "STAGE_CHANGED" | "FOLLOW_UP_SCHEDULED";

type RecruitmentMetadata = {
  schemaVersion: 1;
  program: typeof PROGRAM;
  eventType: RecruitmentEventType;
  stage?: VetRecruitmentStage;
  fullName?: string;
  email?: string;
  phone?: string | null;
  marketDaneCode?: string;
  source?: string | null;
  nextFollowUpAt?: string | null;
  reason?: string;
};

type RecruitmentEvent = {
  leadId: string;
  createdAt: Date;
  metadata: RecruitmentMetadata;
};

type DerivedLead = {
  leadId: string;
  fullName: string;
  email: string;
  phone: string | null;
  marketDaneCode: string;
  source: string | null;
  stage: VetRecruitmentStage;
  nextFollowUpAt: string | null;
  createdAt: string;
  lastEventAt: string;
  eventCount: number;
  conflicted: boolean;
  conflictReasons: string[];
};

type RecruitmentVetProfile = {
  city: string | null;
  department: string | null;
  latitude: number | null;
  longitude: number | null;
  serviceRadius: number;
  verificationStatus: VerificationStatus;
  isVerified: boolean;
  isActive: boolean;
  verificationDocuments: Array<{
    type: DocumentType;
    status: DocumentStatus;
  }>;
  professionalRegistryCheck: { status: string } | null;
};

type RecruitmentUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  isActive: boolean;
  role: UserRole;
  vetProfile: RecruitmentVetProfile | null;
};

export type RecruitmentActor = {
  id: string;
  role: UserRole;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class VetRecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: CoverageService,
    private readonly supply: VetSupplyReadinessService,
  ) {}

  async createLead(dto: CreateVetRecruitmentLeadDto, actor: RecruitmentActor) {
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim();
    const market = this.getMarket(dto.marketDaneCode);
    const existing = (await this.getDerivedLeads()).find(
      (lead) => lead.email === email,
    );
    if (existing) {
      throw new ConflictException({
        error: "VET_RECRUITMENT_LEAD_ALREADY_EXISTS",
        leadId: existing.leadId,
        stage: existing.stage,
      });
    }

    const leadId = randomUUID();
    const nextFollowUpAt = this.normalizeFutureDate(dto.nextFollowUpAt);
    await this.appendEvent(
      leadId,
      {
        schemaVersion: 1,
        program: PROGRAM,
        eventType: "CREATED",
        stage: "NEW",
        fullName,
        email,
        phone: dto.phone?.trim() || null,
        marketDaneCode: market.daneCode,
        source: dto.source?.trim() || null,
        nextFollowUpAt,
      },
      actor,
    );

    return this.getLead(leadId);
  }

  async updateStage(
    leadId: string,
    dto: UpdateVetRecruitmentStageDto,
    actor: RecruitmentActor,
  ) {
    const current = await this.getLeadState(leadId);
    this.assertTransition(current.stage, dto.stage);

    await this.appendEvent(
      leadId,
      {
        schemaVersion: 1,
        program: PROGRAM,
        eventType: "STAGE_CHANGED",
        stage: dto.stage,
        nextFollowUpAt:
          dto.nextFollowUpAt === undefined
            ? undefined
            : this.normalizeFutureDate(dto.nextFollowUpAt),
        reason: dto.reason?.trim() || undefined,
      },
      actor,
    );

    return this.getLead(leadId);
  }

  async scheduleFollowUp(
    leadId: string,
    dto: ScheduleVetRecruitmentFollowUpDto,
    actor: RecruitmentActor,
  ) {
    await this.getLeadState(leadId);
    await this.appendEvent(
      leadId,
      {
        schemaVersion: 1,
        program: PROGRAM,
        eventType: "FOLLOW_UP_SCHEDULED",
        nextFollowUpAt: this.normalizeFutureDate(dto.nextFollowUpAt),
        reason: dto.reason?.trim() || undefined,
      },
      actor,
    );
    return this.getLead(leadId);
  }

  async getAdminSnapshot(marketDaneCode?: string) {
    if (marketDaneCode) this.getMarket(marketDaneCode);

    const [derivedLeads, supplySnapshot] = await Promise.all([
      this.getDerivedLeads(),
      this.supply.getSupplyFunnelSnapshot(),
    ]);
    const filtered = marketDaneCode
      ? derivedLeads.filter((lead) => lead.marketDaneCode === marketDaneCode)
      : derivedLeads;

    const users = await this.getUsersForLeads(filtered);
    const usersByEmail = new Map(users.map((user) => [user.email, user]));
    const leads = filtered
      .map((lead) =>
        this.enrichLead(lead, usersByEmail.get(lead.email) ?? null),
      )
      .sort((a, b) => this.sortLeads(a, b));

    const markets = COLOMBIA_LAUNCH_MARKETS.map((market) => {
      const marketLeads = leads.filter(
        (lead) => lead.marketDaneCode === market.daneCode,
      );
      const supplyMarket = supplySnapshot.markets.find(
        (item) => item.daneCode === market.daneCode,
      );
      const activeLeads = marketLeads.filter((lead) => lead.stage !== "LOST");
      const registered = marketLeads.filter(
        (lead) => lead.conversionStage !== "LEAD_ONLY",
      ).length;
      const operationalReadyFromCrm = marketLeads.filter(
        (lead) => lead.conversionStage === "OPERATIONAL_READY",
      ).length;

      return {
        code: market.code,
        daneCode: market.daneCode,
        city: market.city,
        department: market.department,
        leads: marketLeads.length,
        activeLeads: activeLeads.length,
        new: marketLeads.filter((lead) => lead.stage === "NEW").length,
        contacted: marketLeads.filter((lead) => lead.stage === "CONTACTED")
          .length,
        interested: marketLeads.filter((lead) => lead.stage === "INTERESTED")
          .length,
        invited: marketLeads.filter((lead) => lead.stage === "INVITED").length,
        lost: marketLeads.filter((lead) => lead.stage === "LOST").length,
        registeredAccounts: registered,
        operationalReadyFromCrm,
        totalOperationalSupply: supplyMarket?.operationalGeoReady ?? 0,
        minimumOperationalVets:
          supplyMarket?.minimumOperationalVets ??
          MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
        coverageGap:
          supplyMarket?.coverageGap ?? MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
        supplyReady: supplyMarket?.supplyReady ?? false,
      } as const;
    });

    const dueFollowUps = leads.filter((lead) =>
      this.isFollowUpDue(lead),
    ).length;
    const activeLeads = leads.filter((lead) => lead.stage !== "LOST").length;
    const registeredAccounts = leads.filter(
      (lead) => lead.conversionStage !== "LEAD_ONLY",
    ).length;
    const operationalReadyFromCrm = leads.filter(
      (lead) => lead.conversionStage === "OPERATIONAL_READY",
    ).length;

    return {
      phase: 20,
      program: PROGRAM,
      ledger: "audit_logs",
      appendOnly: true,
      commercialLaunchAuthorized: false,
      leadPresenceNeverCountsAsCoverage: true,
      operationalSupplySource: "GET /api/coverage/supply-funnel",
      privacyBoundary:
        "Lead contact data is restricted to ADMIN/SUPERADMIN. Public coverage endpoints never expose recruitment PII.",
      totals: {
        leads: leads.length,
        activeLeads,
        lostLeads: leads.length - activeLeads,
        registeredAccounts,
        operationalReadyFromCrm,
        dueFollowUps,
      },
      markets: marketDaneCode
        ? markets.filter((market) => market.daneCode === marketDaneCode)
        : markets,
      leads,
      generatedAt: new Date().toISOString(),
    } as const;
  }

  private async getLead(leadId: string) {
    const lead = await this.getLeadState(leadId);
    const [user] = await this.getUsersForLeads([lead]);
    return this.enrichLead(lead, user ?? null);
  }

  private async getLeadState(leadId: string): Promise<DerivedLead> {
    const events = await this.getEvents(leadId);
    if (events.length === 0) {
      throw new NotFoundException("Veterinarian recruitment lead not found.");
    }
    return this.deriveLead(events);
  }

  private async getDerivedLeads(): Promise<DerivedLead[]> {
    const events = await this.getEvents();
    const grouped = new Map<string, RecruitmentEvent[]>();
    for (const event of events) {
      const stream = grouped.get(event.leadId) ?? [];
      stream.push(event);
      grouped.set(event.leadId, stream);
    }
    return [...grouped.values()].map((stream) => this.deriveLead(stream));
  }

  private deriveLead(events: RecruitmentEvent[]): DerivedLead {
    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const created = sorted.filter(
      (event) => event.metadata.eventType === "CREATED",
    );
    const conflictReasons: string[] = [];
    if (created.length !== 1)
      conflictReasons.push("INVALID_CREATED_EVENT_COUNT");

    const seed = created[0]?.metadata;
    if (
      !seed?.fullName ||
      !seed.email ||
      !seed.marketDaneCode ||
      seed.stage !== "NEW"
    ) {
      conflictReasons.push("INVALID_CREATED_EVENT_PAYLOAD");
    }

    let stage: VetRecruitmentStage = "NEW";
    let nextFollowUpAt = seed?.nextFollowUpAt ?? null;
    for (const event of sorted) {
      if (
        event.metadata.eventType === "STAGE_CHANGED" &&
        event.metadata.stage
      ) {
        stage = event.metadata.stage;
      }
      if (event.metadata.nextFollowUpAt !== undefined) {
        nextFollowUpAt = event.metadata.nextFollowUpAt;
      }
    }

    return {
      leadId: sorted[0].leadId,
      fullName: seed?.fullName ?? "Unknown",
      email: seed?.email ?? "unknown@example.invalid",
      phone: seed?.phone ?? null,
      marketDaneCode: seed?.marketDaneCode ?? "00000",
      source: seed?.source ?? null,
      stage,
      nextFollowUpAt,
      createdAt: sorted[0].createdAt.toISOString(),
      lastEventAt:
        sorted.at(-1)?.createdAt.toISOString() ??
        sorted[0].createdAt.toISOString(),
      eventCount: sorted.length,
      conflicted: conflictReasons.length > 0,
      conflictReasons,
    };
  }

  private enrichLead(lead: DerivedLead, user: RecruitmentUser | null) {
    const market = COLOMBIA_LAUNCH_MARKETS.find(
      (candidate) => candidate.daneCode === lead.marketDaneCode,
    );
    const conversion = this.resolveConversion(user);
    return {
      ...lead,
      market: market
        ? {
            code: market.code,
            daneCode: market.daneCode,
            city: market.city,
            department: market.department,
          }
        : null,
      ...conversion,
      followUpDue: this.isDateDue(lead.nextFollowUpAt),
    } as const;
  }

  private resolveConversion(user: RecruitmentUser | null) {
    if (!user) {
      return {
        linkedUserId: null,
        conversionStage: "LEAD_ONLY" as const,
        nextAction:
          "Contact candidate and send the veterinarian registration path.",
      };
    }
    if (user.role !== UserRole.VET) {
      return {
        linkedUserId: user.id,
        conversionStage: "ACCOUNT_ROLE_MISMATCH" as const,
        nextAction:
          "Resolve the existing account role before continuing; do not create a duplicate identity.",
      };
    }
    if (!user.emailVerified) {
      return {
        linkedUserId: user.id,
        conversionStage: "ACCOUNT_EMAIL_UNVERIFIED" as const,
        nextAction: "Ask the veterinarian to verify the account email.",
      };
    }
    if (!user.vetProfile) {
      return {
        linkedUserId: user.id,
        conversionStage: "ACCOUNT_REGISTERED" as const,
        nextAction: "Complete the veterinarian professional profile.",
      };
    }

    const profile = user.vetProfile;
    if (!this.coverage.isVetServiceAreaConsistent(profile)) {
      return {
        linkedUserId: user.id,
        conversionStage: "SERVICE_AREA_REQUIRED" as const,
        nextAction:
          "Complete a geo-consistent city, coordinates and service radius.",
      };
    }

    const approvedTypes = new Set(
      profile.verificationDocuments
        .filter((document) => document.status === DocumentStatus.APPROVED)
        .map((document) => document.type),
    );
    const approvedDocuments = REQUIRED_DOCUMENTS.every((type) =>
      approvedTypes.has(type),
    );
    if (!approvedDocuments) {
      return {
        linkedUserId: user.id,
        conversionStage: "DOCUMENT_REVIEW_REQUIRED" as const,
        nextAction: "Complete and approve all required professional documents.",
      };
    }
    if (profile.professionalRegistryCheck?.status !== "VERIFIED") {
      return {
        linkedUserId: user.id,
        conversionStage: "REGISTRY_CHECK_REQUIRED" as const,
        nextAction: "Complete the real professional registry verification.",
      };
    }
    if (
      profile.verificationStatus !== VerificationStatus.APPROVED ||
      !profile.isVerified
    ) {
      return {
        linkedUserId: user.id,
        conversionStage: "VERIFICATION_APPROVAL_REQUIRED" as const,
        nextAction: "Complete administrator verification approval.",
      };
    }
    if (!profile.isActive || !user.isActive) {
      return {
        linkedUserId: user.id,
        conversionStage: "PROFILE_INACTIVE" as const,
        nextAction:
          "Resolve the inactive account/profile before counting supply.",
      };
    }
    return {
      linkedUserId: user.id,
      conversionStage: "OPERATIONAL_READY" as const,
      nextAction:
        "Operational supply ready; maintain availability and monitoring.",
    };
  }

  private async getUsersForLeads(
    leads: DerivedLead[],
  ): Promise<RecruitmentUser[]> {
    const emails = [...new Set(leads.map((lead) => lead.email))];
    if (emails.length === 0) return [];
    return this.prisma.user.findMany({
      where: { email: { in: emails } },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        isActive: true,
        role: true,
        vetProfile: {
          select: {
            city: true,
            department: true,
            latitude: true,
            longitude: true,
            serviceRadius: true,
            verificationStatus: true,
            isVerified: true,
            isActive: true,
            verificationDocuments: {
              select: { type: true, status: true },
            },
            professionalRegistryCheck: {
              select: { status: true },
            },
          },
        },
      },
    });
  }

  private assertTransition(
    current: VetRecruitmentStage,
    target: VetRecruitmentStage,
  ) {
    if (current === target) {
      throw new ConflictException("Recruitment lead is already in that stage.");
    }
    if (target === "NEW") {
      throw new BadRequestException(
        "NEW is only valid when a lead is created.",
      );
    }
    if (target === "LOST") return;
    if (current === "LOST" && target === "CONTACTED") return;
    if (current === "LOST") {
      throw new BadRequestException(
        "A lost lead must be reopened as CONTACTED before advancing.",
      );
    }
    if (STAGE_RANK[target] <= STAGE_RANK[current]) {
      throw new BadRequestException(
        "Recruitment stages cannot move backwards. Use follow-up scheduling for repeated contact.",
      );
    }
  }

  private getMarket(daneCode: string) {
    const market = COLOMBIA_LAUNCH_MARKETS.find(
      (candidate) => candidate.daneCode === daneCode,
    );
    if (!market) {
      throw new BadRequestException({
        error: "UNSUPPORTED_RECRUITMENT_MARKET",
        marketDaneCode: daneCode,
      });
    }
    return market;
  }

  private normalizeFutureDate(value?: string | null): string | null {
    if (value == null || value === "") return null;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      throw new BadRequestException("Invalid follow-up timestamp.");
    }
    if (timestamp <= Date.now()) {
      throw new BadRequestException(
        "Follow-up must be scheduled in the future.",
      );
    }
    return new Date(timestamp).toISOString();
  }

  private isFollowUpDue(lead: {
    stage: VetRecruitmentStage;
    nextFollowUpAt: string | null;
  }): boolean {
    return lead.stage !== "LOST" && this.isDateDue(lead.nextFollowUpAt);
  }

  private isDateDue(value: string | null): boolean {
    return Boolean(value && Date.parse(value) <= Date.now());
  }

  private sortLeads(
    a: {
      followUpDue: boolean;
      nextFollowUpAt: string | null;
      createdAt: string;
    },
    b: {
      followUpDue: boolean;
      nextFollowUpAt: string | null;
      createdAt: string;
    },
  ): number {
    if (a.followUpDue !== b.followUpDue) return a.followUpDue ? -1 : 1;
    if (a.nextFollowUpAt && b.nextFollowUpAt) {
      return Date.parse(a.nextFollowUpAt) - Date.parse(b.nextFollowUpAt);
    }
    if (a.nextFollowUpAt) return -1;
    if (b.nextFollowUpAt) return 1;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  }

  private async appendEvent(
    leadId: string,
    metadata: RecruitmentMetadata,
    actor: RecruitmentActor,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        actorIp: this.normalizeIp(actor.ip),
        actorUserAgent: this.truncate(actor.userAgent, 500),
        action: AuditAction.CONFIG_CHANGED,
        severity:
          metadata.eventType === "STAGE_CHANGED" && metadata.stage === "LOST"
            ? AuditSeverity.WARN
            : AuditSeverity.INFO,
        targetType: TARGET_TYPE,
        targetId: leadId,
        reason: `Vet recruitment ${metadata.eventType.toLowerCase()}`,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async getEvents(leadId?: string): Promise<RecruitmentEvent[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: AuditAction.CONFIG_CHANGED,
        targetType: TARGET_TYPE,
        ...(leadId ? { targetId: leadId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: MAX_EVENT_ROWS + 1,
      select: {
        targetId: true,
        createdAt: true,
        metadata: true,
      },
    });
    if (rows.length > MAX_EVENT_ROWS) {
      throw new ServiceUnavailableException(
        "Veterinarian recruitment ledger exceeded the safe operational read boundary.",
      );
    }
    return rows
      .map((row) => {
        if (!row.targetId) return null;
        const metadata = this.parseMetadata(row.metadata);
        if (!metadata) return null;
        return {
          leadId: row.targetId,
          createdAt: row.createdAt,
          metadata,
        } satisfies RecruitmentEvent;
      })
      .filter((event): event is RecruitmentEvent => Boolean(event));
  }

  private parseMetadata(
    value: Prisma.JsonValue | null,
  ): RecruitmentMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const raw = value as Record<string, unknown>;
    if (raw.schemaVersion !== 1 || raw.program !== PROGRAM) return null;
    if (
      !["CREATED", "STAGE_CHANGED", "FOLLOW_UP_SCHEDULED"].includes(
        String(raw.eventType),
      )
    ) {
      return null;
    }
    return raw as unknown as RecruitmentMetadata;
  }

  private normalizeIp(ip?: string): string | undefined {
    if (!ip) return undefined;
    return ip.split(",")[0].trim().slice(0, 45);
  }

  private truncate(value?: string, max = 500): string | undefined {
    if (!value) return undefined;
    return value.length > max ? value.slice(0, max) : value;
  }
}
