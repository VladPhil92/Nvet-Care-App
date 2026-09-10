import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AuditAction, AuditSeverity, Prisma, UserRole } from "@prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { MailService } from "../common/mail/mail.service";
import { COLOMBIA_LAUNCH_MARKETS } from "../coverage/coverage.constants";
import { PrismaService } from "../prisma/prisma.service";
import { SendVetInvitationDto } from "./dto/vet-invitation.dto";

const PROGRAM = "vet-invitation-conversion-phase-21";
const TARGET_TYPE = "VET_RECRUITMENT_INVITATION";
const LEAD_PROGRAM = "vet-recruitment-crm-phase-20";
const LEAD_TARGET_TYPE = "VET_RECRUITMENT_LEAD";
const MAX_EVENT_ROWS = 5000;
const DEFAULT_EXPIRY_HOURS = 72;
const DEFAULT_FOLLOW_UP_HOURS = 48;

const INVITATION_EVENTS = [
  "ISSUED",
  "SEND_ACCEPTED",
  "SEND_FAILED",
  "SUPERSEDED",
  "CLAIMED",
] as const;

type InvitationEventType = (typeof INVITATION_EVENTS)[number];
type InvitationStatus =
  | "PENDING"
  | "ACTIVE"
  | "CLAIMED"
  | "EXPIRED"
  | "SUPERSEDED"
  | "SEND_FAILED"
  | "CONFLICTED";

type InvitationMetadata = {
  schemaVersion: 1;
  program: typeof PROGRAM;
  eventType: InvitationEventType;
  leadId?: string;
  email?: string;
  fullName?: string;
  marketDaneCode?: string;
  tokenHash?: string;
  expiresAt?: string;
  mailDriver?: string;
  providerMessageId?: string | null;
  failureCode?: string;
  claimedUserId?: string;
};

type InvitationEvent = {
  invitationId: string;
  createdAt: Date;
  metadata: InvitationMetadata;
};

type InvitationRecord = {
  invitationId: string;
  leadId: string;
  email: string;
  fullName: string;
  marketDaneCode: string;
  tokenHash: string;
  expiresAt: string;
  issuedAt: string;
  providerAcceptedAt: string | null;
  claimedAt: string | null;
  claimedUserId: string | null;
  mailDriver: string | null;
  providerMessageId: string | null;
  status: InvitationStatus;
  conflicted: boolean;
};

type LeadState = {
  leadId: string;
  fullName: string;
  email: string;
  marketDaneCode: string;
  stage: "NEW" | "CONTACTED" | "INTERESTED" | "INVITED" | "LOST";
  conflicted: boolean;
};

export type InvitationActor = {
  id: string;
  role: UserRole;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class VetInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async sendInvitation(
    leadId: string,
    dto: SendVetInvitationDto,
    actor: InvitationActor,
  ) {
    const lead = await this.getLeadState(leadId);
    if (lead.conflicted) {
      throw new ConflictException("Recruitment lead history is conflicted.");
    }
    if (lead.stage === "LOST") {
      throw new ConflictException(
        "A lost recruitment lead must be reopened before invitation.",
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: lead.email },
      select: { id: true, role: true, isActive: true },
    });
    if (existingUser && existingUser.role !== UserRole.VET) {
      throw new ConflictException({
        error: "VET_INVITATION_ACCOUNT_ROLE_CONFLICT",
        message:
          "This email already belongs to a non-veterinarian account and cannot be attributed automatically.",
      });
    }

    this.assertProductionMailReady();
    const appUrl = this.getPublicAppUrl();
    const activeRecords = (await this.getInvitationRecords()).filter(
      (record) => record.leadId === leadId && record.status === "ACTIVE",
    );
    for (const record of activeRecords) {
      await this.appendInvitationEvent(
        record.invitationId,
        {
          schemaVersion: 1,
          program: PROGRAM,
          eventType: "SUPERSEDED",
        },
        actor,
      );
    }

    const invitationId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(token);
    const expiresInHours = dto.expiresInHours ?? DEFAULT_EXPIRY_HOURS;
    const expiresAt = new Date(
      Date.now() + expiresInHours * 60 * 60 * 1000,
    ).toISOString();

    await this.appendInvitationEvent(
      invitationId,
      {
        schemaVersion: 1,
        program: PROGRAM,
        eventType: "ISSUED",
        leadId,
        email: lead.email,
        fullName: lead.fullName,
        marketDaneCode: lead.marketDaneCode,
        tokenHash,
        expiresAt,
      },
      actor,
    );

    const market = this.getMarket(lead.marketDaneCode);
    const invitationLink = `${appUrl}/#vetInvite=${encodeURIComponent(token)}`;
    const rendered = this.renderInvitationMail({
      fullName: lead.fullName,
      city: market.city,
      invitationLink,
      expiresInHours,
      existingAccount: Boolean(existingUser),
    });
    const sendResult = await this.mail.send({
      to: lead.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      category: "vet_recruitment_invitation",
    });

    if (!sendResult.ok) {
      await this.appendInvitationEvent(
        invitationId,
        {
          schemaVersion: 1,
          program: PROGRAM,
          eventType: "SEND_FAILED",
          mailDriver: sendResult.driver,
          failureCode: "PROVIDER_REJECTED",
        },
        actor,
      );
      throw new ServiceUnavailableException({
        error: "VET_INVITATION_SEND_FAILED",
        mailDriver: sendResult.driver,
      });
    }

    await this.appendInvitationEvent(
      invitationId,
      {
        schemaVersion: 1,
        program: PROGRAM,
        eventType: "SEND_ACCEPTED",
        mailDriver: sendResult.driver,
        providerMessageId: sendResult.providerMessageId ?? null,
      },
      actor,
    );

    await this.syncLeadAfterInvitation(
      lead,
      dto.followUpInHours ?? DEFAULT_FOLLOW_UP_HOURS,
      actor,
    );

    const record = await this.getInvitationRecord(invitationId);
    return this.toAdminRecord(record);
  }

  async getAdminSummary() {
    const records = await this.getInvitationRecords();
    const latestByLead = new Map<string, InvitationRecord>();
    for (const record of records) {
      const current = latestByLead.get(record.leadId);
      if (!current || Date.parse(record.issuedAt) > Date.parse(current.issuedAt)) {
        latestByLead.set(record.leadId, record);
      }
    }

    return {
      phase: 21,
      program: PROGRAM,
      bearerTokensStored: false,
      tokenStorage: "sha256-only",
      linkTransport: "URL fragment",
      productionMailFailClosed: true,
      totals: {
        invitations: records.length,
        active: records.filter((record) => record.status === "ACTIVE").length,
        claimed: records.filter((record) => record.status === "CLAIMED").length,
        expired: records.filter((record) => record.status === "EXPIRED").length,
        failed: records.filter((record) => record.status === "SEND_FAILED").length,
        conflicted: records.filter((record) => record.status === "CONFLICTED")
          .length,
      },
      latestByLead: [...latestByLead.values()]
        .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt))
        .map((record) => this.toAdminRecord(record)),
      generatedAt: new Date().toISOString(),
    } as const;
  }

  async previewInvitation(token: string) {
    const record = await this.resolveUsableInvitation(token);
    if (!record) {
      return { valid: false } as const;
    }
    const market = this.getMarket(record.marketDaneCode);
    const user = await this.prisma.user.findUnique({
      where: { email: record.email },
      select: { role: true, isActive: true },
    });
    if (user && user.role !== UserRole.VET) {
      return { valid: false } as const;
    }

    return {
      valid: true,
      fullName: record.fullName,
      email: record.email,
      market: {
        daneCode: market.daneCode,
        city: market.city,
        department: market.department,
      },
      expiresAt: record.expiresAt,
      existingAccount: Boolean(user?.isActive),
      role: "VET" as const,
    } as const;
  }

  async claimInvitation(
    token: string,
    userId: string,
    actor: InvitationActor,
  ) {
    const tokenHash = this.hashToken(token);
    const initial = await this.resolveUsableInvitation(token);
    if (!initial) {
      throw new ConflictException({
        error: "VET_INVITATION_INVALID_OR_EXPIRED",
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!user || !user.isActive || user.role !== UserRole.VET) {
      throw new ForbiddenException("A valid active VET account is required.");
    }
    if (user.email.trim().toLowerCase() !== initial.email) {
      throw new ForbiddenException({
        error: "VET_INVITATION_EMAIL_MISMATCH",
      });
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.auditLog.findMany({
            where: {
              action: AuditAction.CONFIG_CHANGED,
              targetType: TARGET_TYPE,
              targetId: initial.invitationId,
            },
            orderBy: { createdAt: "asc" },
            take: MAX_EVENT_ROWS + 1,
            select: { targetId: true, createdAt: true, metadata: true },
          });
          if (rows.length > MAX_EVENT_ROWS) {
            throw new ServiceUnavailableException(
              "Invitation ledger exceeded the safe read boundary.",
            );
          }
          const events = this.rowsToInvitationEvents(rows);
          const current = this.deriveInvitation(events);
          if (
            current.status !== "ACTIVE" ||
            current.tokenHash !== tokenHash ||
            Date.parse(current.expiresAt) <= Date.now()
          ) {
            throw new ConflictException({
              error: "VET_INVITATION_ALREADY_CONSUMED",
            });
          }

          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              actorRole: actor.role,
              actorIp: this.normalizeIp(actor.ip),
              actorUserAgent: this.truncate(actor.userAgent, 500),
              action: AuditAction.CONFIG_CHANGED,
              severity: AuditSeverity.INFO,
              targetType: TARGET_TYPE,
              targetId: initial.invitationId,
              reason: "Vet invitation claimed",
              metadata: {
                schemaVersion: 1,
                program: PROGRAM,
                eventType: "CLAIMED",
                claimedUserId: user.id,
              } satisfies InvitationMetadata as unknown as Prisma.InputJsonValue,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      if ((error as { code?: string })?.code === "P2034") {
        throw new ConflictException({
          error: "VET_INVITATION_ALREADY_CONSUMED",
        });
      }
      throw error;
    }

    return {
      claimed: true,
      leadId: initial.leadId,
      userId: user.id,
      nextStep: "VET_ONBOARDING",
    } as const;
  }

  private async resolveUsableInvitation(
    token: string,
  ): Promise<InvitationRecord | null> {
    const tokenHash = this.hashToken(token);
    const records = await this.getInvitationRecords();
    const record = records.find((candidate) => candidate.tokenHash === tokenHash);
    if (!record || record.status !== "ACTIVE") return null;
    if (Date.parse(record.expiresAt) <= Date.now()) return null;
    return record;
  }

  private async getInvitationRecord(
    invitationId: string,
  ): Promise<InvitationRecord> {
    const events = await this.getInvitationEvents(invitationId);
    if (events.length === 0) {
      throw new NotFoundException("Veterinarian invitation not found.");
    }
    return this.deriveInvitation(events);
  }

  private async getInvitationRecords(): Promise<InvitationRecord[]> {
    const events = await this.getInvitationEvents();
    const grouped = new Map<string, InvitationEvent[]>();
    for (const event of events) {
      const stream = grouped.get(event.invitationId) ?? [];
      stream.push(event);
      grouped.set(event.invitationId, stream);
    }
    return [...grouped.values()].map((stream) => this.deriveInvitation(stream));
  }

  private deriveInvitation(events: InvitationEvent[]): InvitationRecord {
    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const issued = sorted.filter(
      (event) => event.metadata.eventType === "ISSUED",
    );
    const seed = issued[0]?.metadata;
    const claims = sorted.filter(
      (event) => event.metadata.eventType === "CLAIMED",
    );
    const conflicted =
      issued.length !== 1 ||
      claims.length > 1 ||
      !seed?.leadId ||
      !seed.email ||
      !seed.fullName ||
      !seed.marketDaneCode ||
      !seed.tokenHash ||
      !seed.expiresAt;
    const accepted = sorted.find(
      (event) => event.metadata.eventType === "SEND_ACCEPTED",
    );
    const failed = sorted.find(
      (event) => event.metadata.eventType === "SEND_FAILED",
    );
    const superseded = sorted.find(
      (event) => event.metadata.eventType === "SUPERSEDED",
    );
    const claim = claims[0];

    let status: InvitationStatus = "PENDING";
    if (conflicted) status = "CONFLICTED";
    else if (claim) status = "CLAIMED";
    else if (superseded) status = "SUPERSEDED";
    else if (failed) status = "SEND_FAILED";
    else if (!accepted) status = "PENDING";
    else if (Date.parse(seed!.expiresAt!) <= Date.now()) status = "EXPIRED";
    else status = "ACTIVE";

    return {
      invitationId: sorted[0]?.invitationId ?? "unknown",
      leadId: seed?.leadId ?? "unknown",
      email: seed?.email ?? "unknown@example.invalid",
      fullName: seed?.fullName ?? "Unknown",
      marketDaneCode: seed?.marketDaneCode ?? "00000",
      tokenHash: seed?.tokenHash ?? "",
      expiresAt: seed?.expiresAt ?? new Date(0).toISOString(),
      issuedAt: sorted[0]?.createdAt.toISOString() ?? new Date(0).toISOString(),
      providerAcceptedAt: accepted?.createdAt.toISOString() ?? null,
      claimedAt: claim?.createdAt.toISOString() ?? null,
      claimedUserId: claim?.metadata.claimedUserId ?? null,
      mailDriver: accepted?.metadata.mailDriver ?? failed?.metadata.mailDriver ?? null,
      providerMessageId: accepted?.metadata.providerMessageId ?? null,
      status,
      conflicted,
    };
  }

  private async getInvitationEvents(
    invitationId?: string,
  ): Promise<InvitationEvent[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: AuditAction.CONFIG_CHANGED,
        targetType: TARGET_TYPE,
        ...(invitationId ? { targetId: invitationId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: MAX_EVENT_ROWS + 1,
      select: { targetId: true, createdAt: true, metadata: true },
    });
    if (rows.length > MAX_EVENT_ROWS) {
      throw new ServiceUnavailableException(
        "Invitation ledger exceeded the safe read boundary.",
      );
    }
    return this.rowsToInvitationEvents(rows);
  }

  private rowsToInvitationEvents(
    rows: Array<{
      targetId: string | null;
      createdAt: Date;
      metadata: Prisma.JsonValue | null;
    }>,
  ): InvitationEvent[] {
    return rows
      .map((row) => {
        if (!row.targetId) return null;
        const metadata = this.parseInvitationMetadata(row.metadata);
        if (!metadata) return null;
        return {
          invitationId: row.targetId,
          createdAt: row.createdAt,
          metadata,
        } satisfies InvitationEvent;
      })
      .filter((event): event is InvitationEvent => Boolean(event));
  }

  private parseInvitationMetadata(
    value: Prisma.JsonValue | null,
  ): InvitationMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    if (raw.schemaVersion !== 1 || raw.program !== PROGRAM) return null;
    if (!INVITATION_EVENTS.includes(raw.eventType as InvitationEventType)) {
      return null;
    }
    return raw as unknown as InvitationMetadata;
  }

  private async getLeadState(leadId: string): Promise<LeadState> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: AuditAction.CONFIG_CHANGED,
        targetType: LEAD_TARGET_TYPE,
        targetId: leadId,
      },
      orderBy: { createdAt: "asc" },
      take: MAX_EVENT_ROWS + 1,
      select: { metadata: true },
    });
    if (rows.length === 0) {
      throw new NotFoundException("Veterinarian recruitment lead not found.");
    }
    if (rows.length > MAX_EVENT_ROWS) {
      throw new ServiceUnavailableException(
        "Recruitment lead history exceeded the safe read boundary.",
      );
    }

    const metadata = rows
      .map((row) => row.metadata)
      .filter(
        (value): value is Prisma.JsonObject =>
          Boolean(value && typeof value === "object" && !Array.isArray(value)),
      )
      .filter(
        (value) =>
          value.schemaVersion === 1 && value.program === LEAD_PROGRAM,
      );
    const created = metadata.filter((value) => value.eventType === "CREATED");
    const seed = created[0];
    if (
      created.length !== 1 ||
      typeof seed?.fullName !== "string" ||
      typeof seed.email !== "string" ||
      typeof seed.marketDaneCode !== "string"
    ) {
      return {
        leadId,
        fullName: "Unknown",
        email: "unknown@example.invalid",
        marketDaneCode: "00000",
        stage: "NEW",
        conflicted: true,
      };
    }

    let stage: LeadState["stage"] = "NEW";
    for (const value of metadata) {
      if (
        value.eventType === "STAGE_CHANGED" &&
        typeof value.stage === "string" &&
        ["NEW", "CONTACTED", "INTERESTED", "INVITED", "LOST"].includes(
          value.stage,
        )
      ) {
        stage = value.stage as LeadState["stage"];
      }
    }

    return {
      leadId,
      fullName: seed.fullName,
      email: seed.email.trim().toLowerCase(),
      marketDaneCode: seed.marketDaneCode,
      stage,
      conflicted: false,
    };
  }

  private async syncLeadAfterInvitation(
    lead: LeadState,
    followUpInHours: number,
    actor: InvitationActor,
  ) {
    if (lead.stage !== "INVITED") {
      await this.appendLeadEvent(
        lead.leadId,
        {
          schemaVersion: 1,
          program: LEAD_PROGRAM,
          eventType: "STAGE_CHANGED",
          stage: "INVITED",
          reason: "phase21_invitation_provider_accepted",
        },
        actor,
      );
    }
    await this.appendLeadEvent(
      lead.leadId,
      {
        schemaVersion: 1,
        program: LEAD_PROGRAM,
        eventType: "FOLLOW_UP_SCHEDULED",
        nextFollowUpAt: new Date(
          Date.now() + followUpInHours * 60 * 60 * 1000,
        ).toISOString(),
        reason: "phase21_invitation_follow_up",
      },
      actor,
    );
  }

  private async appendLeadEvent(
    leadId: string,
    metadata: Record<string, unknown>,
    actor: InvitationActor,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        actorIp: this.normalizeIp(actor.ip),
        actorUserAgent: this.truncate(actor.userAgent, 500),
        action: AuditAction.CONFIG_CHANGED,
        severity: AuditSeverity.INFO,
        targetType: LEAD_TARGET_TYPE,
        targetId: leadId,
        reason: "Vet recruitment phase 21 automation",
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private async appendInvitationEvent(
    invitationId: string,
    metadata: InvitationMetadata,
    actor: InvitationActor,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        actorIp: this.normalizeIp(actor.ip),
        actorUserAgent: this.truncate(actor.userAgent, 500),
        action: AuditAction.CONFIG_CHANGED,
        severity:
          metadata.eventType === "SEND_FAILED"
            ? AuditSeverity.WARN
            : AuditSeverity.INFO,
        targetType: TARGET_TYPE,
        targetId: invitationId,
        reason: `Vet invitation ${metadata.eventType.toLowerCase()}`,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private toAdminRecord(record: InvitationRecord) {
    const market = COLOMBIA_LAUNCH_MARKETS.find(
      (candidate) => candidate.daneCode === record.marketDaneCode,
    );
    return {
      invitationId: record.invitationId,
      leadId: record.leadId,
      email: record.email,
      fullName: record.fullName,
      marketDaneCode: record.marketDaneCode,
      marketCity: market?.city ?? null,
      status: record.status,
      expiresAt: record.expiresAt,
      issuedAt: record.issuedAt,
      providerAcceptedAt: record.providerAcceptedAt,
      claimedAt: record.claimedAt,
      claimedUserId: record.claimedUserId,
      mailDriver: record.mailDriver,
      providerMessageId: record.providerMessageId,
      tokenStored: false,
    } as const;
  }

  private hashToken(token: string): string {
    if (!token || token.length < 32 || token.length > 128) {
      throw new BadRequestException("Invalid veterinarian invitation token.");
    }
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  private getMarket(daneCode: string) {
    const market = COLOMBIA_LAUNCH_MARKETS.find(
      (candidate) => candidate.daneCode === daneCode,
    );
    if (!market) {
      throw new BadRequestException("Unsupported veterinarian recruitment market.");
    }
    return market;
  }

  private assertProductionMailReady() {
    if (process.env.NODE_ENV !== "production") return;
    const driver = (process.env.MAIL_DRIVER ?? "").trim().toLowerCase();
    if (driver !== "sendgrid" || !process.env.SENDGRID_API_KEY) {
      throw new ServiceUnavailableException({
        error: "VET_INVITATION_MAIL_PROVIDER_NOT_READY",
        message:
          "Production invitations require the implemented SendGrid driver and provider credentials.",
      });
    }
  }

  private getPublicAppUrl(): string {
    const configured = process.env.NVET_PUBLIC_APP_URL?.trim();
    const value = configured || "http://localhost:5173";
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new ServiceUnavailableException("NVET_PUBLIC_APP_URL is invalid.");
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ServiceUnavailableException("NVET_PUBLIC_APP_URL must use HTTP(S).");
    }
    if (process.env.NODE_ENV === "production" && !configured) {
      throw new ServiceUnavailableException(
        "NVET_PUBLIC_APP_URL is required for production invitations.",
      );
    }
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      throw new ServiceUnavailableException(
        "Production invitation links must use HTTPS.",
      );
    }
    return value.replace(/\/$/, "");
  }

  private renderInvitationMail(params: {
    fullName: string;
    city: string;
    invitationLink: string;
    expiresInHours: number;
    existingAccount: boolean;
  }) {
    const safeName = this.escapeHtml(params.fullName);
    const safeCity = this.escapeHtml(params.city);
    const safeLink = this.escapeHtml(params.invitationLink);
    const subject = `Invitación profesional Nvet Care — ${params.city}`;
    const accountCopy = params.existingAccount
      ? "Ya detectamos una cuenta veterinaria con este correo. Inicia sesión desde el enlace para vincular la invitación."
      : "Crea tu cuenta veterinaria con el mismo correo de esta invitación para continuar con tu incorporación profesional.";
    const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F5F7F9;font-family:Arial,sans-serif;color:#0D1B2A"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #E2E8EC;border-radius:12px"><tr><td style="padding:28px 32px"><div style="font-size:20px;font-weight:700;margin-bottom:22px">Nvet<span style="color:#34B27A">Care</span></div><h1 style="font-size:22px;margin:0 0 12px">Hola ${safeName},</h1><p style="line-height:1.6">Has sido invitado/a a iniciar el proceso de incorporación veterinaria de Nvet Care para <strong>${safeCity}</strong>.</p><p style="line-height:1.6">${this.escapeHtml(accountCopy)}</p><p><a href="${safeLink}" style="display:inline-block;background:#34B27A;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:700">Continuar incorporación</a></p><p style="font-size:13px;color:#5C6B7A;line-height:1.6">El enlace expira en ${params.expiresInHours} horas. La invitación no constituye aprobación profesional ni habilita atención pública: documentos, registro profesional, zona de servicio y verificación Nvet siguen siendo obligatorios.</p></td></tr></table></td></tr></table></body></html>`;
    const text = `Hola ${params.fullName},\n\nHas sido invitado/a a iniciar el proceso de incorporación veterinaria de Nvet Care para ${params.city}.\n\n${accountCopy}\n\nContinúa aquí: ${params.invitationLink}\n\nEl enlace expira en ${params.expiresInHours} horas. La invitación no equivale a verificación profesional ni habilita atención pública.\n\n— Nvet Care`;
    return { subject, html, text };
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
