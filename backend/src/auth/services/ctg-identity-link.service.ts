import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { AuditAction, AuditSeverity, Prisma } from "@prisma/client";

import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CtgIdentityService } from "./ctg-identity.service";

interface LinkContext {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Explicit two-sided identity linking.
 *
 * Security invariant: an email match is never sufficient proof. The caller
 * must already hold a valid Nvet JWT (enforced by the controller) AND present
 * a CTG One Supabase access token whose signature/issuer/audience/expiry are
 * verified by CtgIdentityService. Only then may both accounts be linked, and
 * only when their normalized emails match.
 *
 * Nvet remains the authority for role/permissions. Linking never changes
 * CLIENT/VET/ADMIN/SUPERADMIN, password, 2FA or professional verification.
 */
@Injectable()
export class CtgIdentityLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctgIdentityService: CtgIdentityService,
    private readonly auditService: AuditService,
  ) {}

  async link(
    nvetUserId: string,
    supabaseAccessToken: string,
    ctx: LinkContext = {},
  ) {
    if (process.env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED !== "true") {
      throw new NotFoundException();
    }

    let claims: { sub: string; email?: string };
    try {
      claims = await this.ctgIdentityService.verify(supabaseAccessToken);
    } catch {
      await this.auditService.log({
        actor: { id: nvetUserId, ip: ctx.ipAddress, userAgent: ctx.userAgent },
        action: AuditAction.NVET_IDENTITY_EXCHANGE_FAILURE,
        severity: AuditSeverity.WARN,
        targetType: "User",
        targetId: nvetUserId,
        reason: "ctg_identity_link_token_verification_failed",
      });
      throw new UnauthorizedException("Sesión de CTG One inválida o expirada");
    }

    if (!claims.email) {
      throw new UnauthorizedException(
        "La identidad CTG One no contiene un correo verificable",
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: nvetUserId },
      select: {
        id: true,
        email: true,
        role: true,
        ctgUserId: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Sesión Nvet inválida");
    }
    if (!user.isActive) {
      throw new ForbiddenException(
        "Esta cuenta está desactivada. Contacta soporte.",
      );
    }

    const nvetEmail = user.email.trim().toLowerCase();
    const ctgEmail = claims.email.trim().toLowerCase();
    if (nvetEmail !== ctgEmail) {
      await this.auditService.log({
        actor: {
          id: user.id,
          role: user.role,
          ip: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
        action: AuditAction.NVET_IDENTITY_EXCHANGE_FAILURE,
        severity: AuditSeverity.WARN,
        targetType: "User",
        targetId: user.id,
        reason: "ctg_identity_link_email_mismatch",
      });
      throw new ConflictException({
        message:
          "El correo de CTG One no coincide con el correo de esta cuenta Nvet Care.",
        error: "CTG_IDENTITY_EMAIL_MISMATCH",
      });
    }

    if (user.ctgUserId && user.ctgUserId !== claims.sub) {
      throw new ConflictException({
        message:
          "Esta cuenta Nvet Care ya está vinculada a otra identidad CTG One.",
        error: "NVET_ACCOUNT_ALREADY_LINKED",
      });
    }

    const existingOwner = await this.prisma.user.findUnique({
      where: { ctgUserId: claims.sub },
      select: { id: true },
    });
    if (existingOwner && existingOwner.id !== user.id) {
      throw new ConflictException({
        message:
          "Esta identidad CTG One ya está vinculada a otra cuenta Nvet Care.",
        error: "CTG_IDENTITY_ALREADY_LINKED",
      });
    }

    if (!user.ctgUserId) {
      try {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { ctgUserId: claims.sub },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new ConflictException({
            message:
              "Esta identidad CTG One ya está vinculada a otra cuenta Nvet Care.",
            error: "CTG_IDENTITY_ALREADY_LINKED",
          });
        }
        throw error;
      }
    }

    await this.auditService.log({
      actor: {
        id: user.id,
        role: user.role,
        ip: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
      action: AuditAction.CONFIG_CHANGED,
      severity: AuditSeverity.INFO,
      targetType: "User",
      targetId: user.id,
      reason: user.ctgUserId
        ? "ctg_identity_link_confirmed"
        : "ctg_identity_linked",
      metadata: {
        identityProvider: "ctg_one_supabase",
        ctgUserId: claims.sub,
        rolePreserved: user.role,
      },
    });

    return {
      linked: true,
      userId: user.id,
      email: user.email,
      role: user.role,
      ctgUserId: claims.sub,
      rolePreserved: true,
    };
  }
}
