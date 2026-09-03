import { ForbiddenException, Injectable } from "@nestjs/common";
import { AuditAction, AuditSeverity, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  BETA_LEGAL_DOCUMENTS,
  BETA_LEGAL_PROGRAM,
  BETA_PRIVACY_VERSION,
  BETA_TERMS_VERSION,
} from "./beta-legal.constants";
import { AcceptBetaLegalDto } from "./dto/accept-beta-legal.dto";

const TARGET_TYPE = "BetaLegalAcceptance";
const REASON = "beta_legal_acceptance";

@Injectable()
export class BetaLegalConsentService {
  constructor(private readonly prisma: PrismaService) {}

  getCurrentDocuments() {
    return BETA_LEGAL_DOCUMENTS;
  }

  async getStatus(userId: string) {
    const acceptance = await this.findCurrentAcceptance(userId);
    return {
      ...BETA_LEGAL_DOCUMENTS,
      accepted: Boolean(acceptance),
      acceptedAt: acceptance?.createdAt?.toISOString() ?? null,
    };
  }

  async accept(userId: string, role: UserRole, dto: AcceptBetaLegalDto) {
    if (
      dto.accepted !== true ||
      dto.termsVersion !== BETA_TERMS_VERSION ||
      dto.privacyVersion !== BETA_PRIVACY_VERSION
    ) {
      throw new ForbiddenException({
        error: "BETA_LEGAL_ACCEPTANCE_INVALID",
        message:
          "Debes aceptar explícitamente las versiones vigentes de términos y privacidad para participar en la beta.",
      });
    }

    const existing = await this.findCurrentAcceptance(userId);
    if (existing) {
      return {
        accepted: true,
        acceptedAt: existing.createdAt.toISOString(),
        ...BETA_LEGAL_DOCUMENTS,
      };
    }

    const created = await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        actorRole: role,
        action: AuditAction.CONFIG_CHANGED,
        severity: AuditSeverity.INFO,
        targetType: TARGET_TYPE,
        targetId: userId,
        reason: REASON,
        afterData: {
          accepted: true,
          program: BETA_LEGAL_PROGRAM,
          termsVersion: BETA_TERMS_VERSION,
          privacyVersion: BETA_PRIVACY_VERSION,
        },
        metadata: {
          program: BETA_LEGAL_PROGRAM,
          termsVersion: BETA_TERMS_VERSION,
          privacyVersion: BETA_PRIVACY_VERSION,
        },
      },
    });

    return {
      accepted: true,
      acceptedAt: created.createdAt.toISOString(),
      ...BETA_LEGAL_DOCUMENTS,
    };
  }

  async assertCurrentAcceptance(userId: string): Promise<void> {
    const acceptance = await this.findCurrentAcceptance(userId);
    if (!acceptance) {
      throw new ForbiddenException({
        error: "BETA_LEGAL_ACCEPTANCE_REQUIRED",
        message:
          "Debes aceptar los términos y el aviso de privacidad vigentes de la beta antes de reservar.",
        legal: BETA_LEGAL_DOCUMENTS,
      });
    }
  }

  private async findCurrentAcceptance(userId: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        actorId: userId,
        targetType: TARGET_TYPE,
        targetId: userId,
        reason: REASON,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        metadata: true,
      },
    });

    return (
      rows.find((row) => {
        const metadata = row.metadata;
        if (
          !metadata ||
          typeof metadata !== "object" ||
          Array.isArray(metadata)
        ) {
          return false;
        }
        const value = metadata as Record<string, unknown>;
        return (
          value.program === BETA_LEGAL_PROGRAM &&
          value.termsVersion === BETA_TERMS_VERSION &&
          value.privacyVersion === BETA_PRIVACY_VERSION
        );
      }) ?? null
    );
  }
}
