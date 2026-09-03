import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  AuditAction,
  AuditSeverity,
  Prisma,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BETA_EVIDENCE_PROGRAM } from "./beta-evidence.constants";
import {
  BetaEvidenceActor,
} from "./beta-evidence.service";
import { BetaLegalConsentService } from "./beta-legal-consent.service";
import {
  InviteBetaCohortMemberDto,
  RevokeBetaCohortMemberDto,
} from "./dto/beta-cohort.dto";

const BETA_COHORT_TARGET_TYPE = "BETA_COHORT_MEMBER";
const MAX_INITIAL_CLIENTS = 50;
const MAX_EVENT_ROWS = 5000;

type BetaCohortEventType = "INVITED" | "REVOKED";
type BetaCohortStatus = "ACTIVE" | "REVOKED" | "CONFLICTED";

type BetaCohortMetadata = {
  schemaVersion: 1;
  program: typeof BETA_EVIDENCE_PROGRAM;
  eventType: BetaCohortEventType;
  reason?: string;
};

type BetaCohortEvent = {
  userId: string;
  createdAt: Date;
  metadata: BetaCohortMetadata;
};

type DerivedBetaCohortMember = {
  userId: string;
  status: BetaCohortStatus;
  invitedAt: string | null;
  revokedAt: string | null;
  lastEventAt: string;
  eventCount: number;
  conflictReasons: string[];
};

type CohortUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
};

@Injectable()
export class BetaCohortService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legalConsent: BetaLegalConsentService,
  ) {}

  async invite(dto: InviteBetaCohortMemberDto, actor: BetaEvidenceActor) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        emailVerified: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Client account not found.");
    }
    this.assertEligibleUser(user);

    const current = await this.getDerivedMember(user.id);
    if (current?.status === "ACTIVE") {
      throw new ConflictException("Client is already active in the beta cohort.");
    }
    if (current?.status === "CONFLICTED") {
      throw new ConflictException(
        "Client cohort history is conflicted and requires reconciliation.",
      );
    }

    const operational = await this.getOperationalSnapshot();
    if (operational.activeMemberships >= MAX_INITIAL_CLIENTS) {
      throw new ConflictException({
        error: "BETA_COHORT_CAP_REACHED",
        maxInitialClients: MAX_INITIAL_CLIENTS,
      });
    }

    await this.appendEvent(
      user.id,
      {
        schemaVersion: 1,
        program: BETA_EVIDENCE_PROGRAM,
        eventType: "INVITED",
        reason: dto.reason?.trim() || undefined,
      },
      actor,
    );

    return this.getMemberForAdmin(user.id);
  }

  async revoke(
    userId: string,
    dto: RevokeBetaCohortMemberDto,
    actor: BetaEvidenceActor,
  ) {
    const current = await this.getDerivedMember(userId);
    if (!current || current.status !== "ACTIVE") {
      throw new ConflictException("Client is not active in the beta cohort.");
    }

    await this.appendEvent(
      userId,
      {
        schemaVersion: 1,
        program: BETA_EVIDENCE_PROGRAM,
        eventType: "REVOKED",
        reason: dto.reason.trim(),
      },
      actor,
    );

    return this.getMemberForAdmin(userId);
  }

  async assertActiveMember(userId: string): Promise<void> {
    const current = await this.getDerivedMember(userId);
    if (!current || current.status !== "ACTIVE") {
      throw new ForbiddenException({
        error: "CLOSED_BETA_ACCESS_REQUIRED",
        message:
          "Esta cuenta todavía no está habilitada para reservar durante la beta cerrada de Cartagena.",
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        emailVerified: true,
      },
    });

    if (!user || !this.isEligibleUser(user)) {
      throw new ForbiddenException({
        error: "CLOSED_BETA_MEMBER_INELIGIBLE",
        message:
          "La membresía beta de esta cuenta ya no cumple los requisitos de elegibilidad.",
      });
    }
  }

  async getSelfStatus(userId: string) {
    const [membership, legal] = await Promise.all([
      this.getDerivedMember(userId),
      this.legalConsent.getStatus(userId),
    ]);

    return {
      invited: membership?.status === "ACTIVE",
      membershipStatus: membership?.status ?? "MISSING",
      invitedAt: membership?.invitedAt ?? null,
      revokedAt: membership?.revokedAt ?? null,
      legal,
      market: "Cartagena de Indias",
    } as const;
  }

  async getOperationalSnapshot() {
    const members = await this.getDerivedMembers();
    const active = members.filter((member) => member.status === "ACTIVE");
    const activeIds = active.map((member) => member.userId);
    const users = activeIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: activeIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            emailVerified: true,
          },
        })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));
    const ineligibleMemberIds = active
      .filter((member) => {
        const user = usersById.get(member.userId);
        return !user || !this.isEligibleUser(user);
      })
      .map((member) => member.userId);

    return {
      ledger: "audit_logs",
      appendOnly: true,
      activeMemberships: active.length,
      eligibleActiveMembers: active.length - ineligibleMemberIds.length,
      ineligibleMembers: ineligibleMemberIds.length,
      maxInitialClients: MAX_INITIAL_CLIENTS,
      remainingSlots: Math.max(0, MAX_INITIAL_CLIENTS - active.length),
      withinLimit: active.length <= MAX_INITIAL_CLIENTS,
      configured: active.length > 0,
    } as const;
  }

  async getAdminSnapshot() {
    const derived = await this.getDerivedMembers();
    const active = derived.filter((member) => member.status === "ACTIVE");
    const activeIds = active.map((member) => member.userId);
    const users = activeIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: activeIds } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            emailVerified: true,
          },
        })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    const members = await Promise.all(
      active.map(async (membership) => {
        const user = usersById.get(membership.userId) ?? null;
        const legal = user
          ? await this.legalConsent.getStatus(user.id)
          : { accepted: false, acceptedAt: null };
        return {
          userId: membership.userId,
          email: user?.email ?? null,
          firstName: user?.firstName ?? null,
          lastName: user?.lastName ?? null,
          emailVerified: user?.emailVerified ?? false,
          accountActive: user?.isActive ?? false,
          eligible: Boolean(user && this.isEligibleUser(user)),
          invitedAt: membership.invitedAt,
          legalAccepted: Boolean(legal.accepted),
          legalAcceptedAt: legal.acceptedAt ?? null,
        };
      }),
    );

    const operational = await this.getOperationalSnapshot();
    return {
      ...operational,
      members,
      revokedMemberships: derived.filter((member) => member.status === "REVOKED")
        .length,
      conflictedMemberships: derived.filter(
        (member) => member.status === "CONFLICTED",
      ).length,
      generatedAt: new Date().toISOString(),
    } as const;
  }

  async getActiveCount(): Promise<number> {
    const snapshot = await this.getOperationalSnapshot();
    return snapshot.activeMemberships;
  }

  private async getMemberForAdmin(userId: string) {
    const membership = await this.getDerivedMember(userId);
    if (!membership) {
      throw new NotFoundException("Beta cohort membership not found.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        emailVerified: true,
      },
    });
    const legal = user
      ? await this.legalConsent.getStatus(user.id)
      : { accepted: false, acceptedAt: null };

    return {
      ...membership,
      email: user?.email ?? null,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      emailVerified: user?.emailVerified ?? false,
      accountActive: user?.isActive ?? false,
      eligible: Boolean(user && this.isEligibleUser(user)),
      legalAccepted: Boolean(legal.accepted),
      legalAcceptedAt: legal.acceptedAt ?? null,
    } as const;
  }

  private async getDerivedMember(
    userId: string,
  ): Promise<DerivedBetaCohortMember | null> {
    const events = await this.getEvents(userId);
    return events.length > 0 ? this.deriveMember(events) : null;
  }

  private async getDerivedMembers(): Promise<DerivedBetaCohortMember[]> {
    const events = await this.getEvents();
    const grouped = new Map<string, BetaCohortEvent[]>();
    for (const event of events) {
      const stream = grouped.get(event.userId) ?? [];
      stream.push(event);
      grouped.set(event.userId, stream);
    }
    return [...grouped.values()].map((stream) => this.deriveMember(stream));
  }

  private deriveMember(events: BetaCohortEvent[]): DerivedBetaCohortMember {
    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const conflictReasons: string[] = [];
    let status: "MISSING" | "ACTIVE" | "REVOKED" = "MISSING";
    let invitedAt: string | null = null;
    let revokedAt: string | null = null;

    for (const event of sorted) {
      if (event.metadata.eventType === "INVITED") {
        if (status === "ACTIVE") {
          conflictReasons.push("DUPLICATE_INVITE_WHILE_ACTIVE");
        } else {
          status = "ACTIVE";
          invitedAt = event.createdAt.toISOString();
          revokedAt = null;
        }
      } else if (event.metadata.eventType === "REVOKED") {
        if (status !== "ACTIVE") {
          conflictReasons.push("REVOKE_WITHOUT_ACTIVE_MEMBERSHIP");
        } else {
          status = "REVOKED";
          revokedAt = event.createdAt.toISOString();
        }
      }
    }

    return {
      userId: sorted[0].userId,
      status: conflictReasons.length > 0 ? "CONFLICTED" : status === "MISSING" ? "REVOKED" : status,
      invitedAt,
      revokedAt,
      lastEventAt: sorted.at(-1)?.createdAt.toISOString() ?? sorted[0].createdAt.toISOString(),
      eventCount: sorted.length,
      conflictReasons,
    };
  }

  private async appendEvent(
    userId: string,
    metadata: BetaCohortMetadata,
    actor: BetaEvidenceActor,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        actorIp: this.normalizeIp(actor.ip),
        actorUserAgent: this.truncate(actor.userAgent, 500),
        action: AuditAction.CONFIG_CHANGED,
        severity:
          metadata.eventType === "REVOKED"
            ? AuditSeverity.WARN
            : AuditSeverity.INFO,
        targetType: BETA_COHORT_TARGET_TYPE,
        targetId: userId,
        reason: `Beta cohort ${metadata.eventType.toLowerCase()}`,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async getEvents(userId?: string): Promise<BetaCohortEvent[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: AuditAction.CONFIG_CHANGED,
        targetType: BETA_COHORT_TARGET_TYPE,
        ...(userId ? { targetId: userId } : {}),
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
        "Beta cohort ledger exceeded the safe operational read boundary.",
      );
    }

    return rows
      .map((row) => {
        if (!row.targetId) return null;
        const metadata = this.parseMetadata(row.metadata);
        if (!metadata) return null;
        return {
          userId: row.targetId,
          createdAt: row.createdAt,
          metadata,
        } satisfies BetaCohortEvent;
      })
      .filter((event): event is BetaCohortEvent => Boolean(event));
  }

  private parseMetadata(
    value: Prisma.JsonValue | null,
  ): BetaCohortMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const raw = value as Record<string, unknown>;
    if (raw.schemaVersion !== 1 || raw.program !== BETA_EVIDENCE_PROGRAM) {
      return null;
    }
    if (!["INVITED", "REVOKED"].includes(String(raw.eventType))) {
      return null;
    }
    return raw as unknown as BetaCohortMetadata;
  }

  private assertEligibleUser(user: CohortUser) {
    if (user.role !== UserRole.CLIENT) {
      throw new BadRequestException("Only CLIENT accounts can join the beta cohort.");
    }
    if (!user.isActive) {
      throw new ConflictException("Client account is inactive.");
    }
    if (!user.emailVerified) {
      throw new ConflictException(
        "Client email must be verified before beta invitation.",
      );
    }
  }

  private isEligibleUser(user: CohortUser): boolean {
    return (
      user.role === UserRole.CLIENT && user.isActive && user.emailVerified
    );
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
