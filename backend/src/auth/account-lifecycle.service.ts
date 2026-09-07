import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  AuditAction,
  AuditSeverity,
  Prisma,
  TransactionStatus,
  UserRole,
} from "@prisma/client";
import * as crypto from "crypto";

import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { PasswordService } from "./services/password.service";
import { TwoFactorService } from "./services/two-factor.service";
import { DeleteAccountDto } from "./dto/delete-account.dto";

const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.DISPUTED,
];

const UNRESOLVED_TRANSACTION_STATUSES: TransactionStatus[] = [
  TransactionStatus.PENDING,
  TransactionStatus.VERIFYING,
  TransactionStatus.CONFIRMED,
  TransactionStatus.DISPUTED,
];

const OPEN_WITHDRAWAL_STATUSES = ["PENDING", "APPROVED", "PROCESSING"];
const COMMITTED_WITHDRAWAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "PROCESSING",
  "PAID",
];
const BALANCE_EPSILON = 0.000001;
const EXTERNAL_DELETION_TTL_SECONDS = 30 * 60;
const GENERIC_EXTERNAL_REQUEST_MESSAGE =
  "Si el correo corresponde a una cuenta activa elegible, enviaremos un código de verificación para continuar la solicitud de eliminación.";

type DeletionUser = Prisma.UserGetPayload<{
  include: { vetProfile: true };
}>;

type DeletionReadClient = Pick<
  Prisma.TransactionClient,
  "appointment" | "transaction" | "vetWithdrawal"
>;

export interface AccountDeletionBlocker {
  code:
    | "ACTIVE_APPOINTMENTS"
    | "UNRESOLVED_TRANSACTIONS"
    | "WALLET_BALANCE"
    | "OPEN_WITHDRAWALS"
    | "ADMIN_ACCOUNT";
  message: string;
  count?: number;
}

@Injectable()
export class AccountLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly twoFactorService: TwoFactorService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  async getDeletionReadiness(userId: string) {
    const user = await this.loadUser(userId);
    const blockers = await this.collectBlockers(this.prisma, user);

    return {
      canDelete: blockers.length === 0,
      reauthMethod: user.passwordHash ? "PASSWORD" : "SESSION",
      twoFactorRequired: user.twoFactorEnabled,
      blockers,
      confirmationPhrase: "ELIMINAR MI CUENTA",
      retainedCategories: [
        "registros de citas y datos clínicos necesarios para continuidad, seguridad o exigencias legales",
        "registros transaccionales, conciliación y auditoría que deban conservarse por obligaciones financieras o de seguridad",
        "registros de verificación profesional cuando deban conservarse para trazabilidad de servicios veterinarios",
      ],
      erasedCategories: [
        "credenciales de acceso y sesiones",
        "correo y datos de contacto del perfil operativo",
        "tokens de verificación y recuperación",
        "notificaciones persistidas",
        "datos preventivos de mascotas que no deban conservarse por una cita histórica",
      ],
    };
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const user = await this.loadUser(userId);
    await this.assertReauthentication(user, dto);
    return this.performDeletion(user);
  }

  /**
   * Google Play requires an outside-the-app web resource from which users can
   * request deletion without being sent back to the installed app. This method
   * starts that flow without disclosing whether an email is registered.
   *
   * The verification code is stateless and HMAC-authenticated. No raw deletion
   * token is persisted; successful deletion makes the code unusable because the
   * account becomes inactive and its email is pseudonymized.
   */
  async requestExternalDeletion(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        firstName: true,
        role: true,
        isActive: true,
      },
    });

    if (
      user?.isActive &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPERADMIN
    ) {
      const verificationCode = this.createExternalDeletionCode(user.id);
      await this.mailService.send({
        to: user.email,
        subject: "Confirma tu solicitud de eliminación de Nvet Care",
        category: "account_deletion_request",
        text: [
          `Hola ${user.firstName ?? "usuario"},`,
          "",
          "Recibimos una solicitud para eliminar tu cuenta de Nvet Care desde el recurso web público.",
          `Código de eliminación: ${verificationCode}`,
          `Este código vence en ${EXTERNAL_DELETION_TTL_SECONDS / 60} minutos.`,
          "",
          "Vuelve al recurso web de eliminación de Nvet Care, escribe tu correo y este código para confirmar la solicitud.",
          "Si no solicitaste esta eliminación, ignora este mensaje.",
        ].join("\n"),
        html: `<p>Hola ${escapeHtml(user.firstName ?? "usuario")},</p>
<p>Recibimos una solicitud para eliminar tu cuenta de <strong>Nvet Care</strong> desde el recurso web público.</p>
<p>Código de eliminación:</p>
<p style="font-family:monospace;font-size:18px;font-weight:700">${verificationCode}</p>
<p>Este código vence en ${EXTERNAL_DELETION_TTL_SECONDS / 60} minutos. Vuelve al recurso web de eliminación de Nvet Care, escribe tu correo y este código para confirmar la solicitud.</p>
<p>Si no solicitaste esta eliminación, ignora este mensaje.</p>`,
      });
    }

    return { message: GENERIC_EXTERNAL_REQUEST_MESSAGE };
  }

  async confirmExternalDeletion(email: string, verificationCode: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { vetProfile: true },
    });

    if (
      !user ||
      !user.isActive ||
      user.role === UserRole.ADMIN ||
      user.role === UserRole.SUPERADMIN
    ) {
      throw new UnauthorizedException("Código inválido o expirado");
    }

    this.verifyExternalDeletionCode(user.id, verificationCode);
    return this.performDeletion(user);
  }

  private async performDeletion(user: DeletionUser) {
    const outcome = await this.withSerializableRetry(async (tx) => {
      // Re-read the account inside the same serializable transaction that
      // performs the destructive mutation. Predicate reads below therefore
      // participate in PostgreSQL SSI and race with concurrent bookings,
      // payments and withdrawals instead of leaving a check-then-delete gap.
      const currentUser = await tx.user.findUnique({
        where: { id: user.id },
        include: { vetProfile: true },
      });
      if (!currentUser || !currentUser.isActive) {
        throw new UnauthorizedException("Cuenta no disponible");
      }

      const blockers = await this.collectBlockers(tx, currentUser);
      if (blockers.length > 0) {
        throw new ConflictException({
          message:
            "La cuenta todavía tiene obligaciones operativas o financieras abiertas y no puede eliminarse aún.",
          error: "ACCOUNT_DELETION_BLOCKED",
          blockers,
        });
      }

      const deletedAt = new Date();
      const anonymizedEmail = `deleted+${currentUser.id}@privacy.invalid`;

      // Device/IP metadata is not required after account deletion. Removing the
      // session rows also guarantees refresh tokens cannot be reused.
      await tx.userSession.deleteMany({ where: { userId: currentUser.id } });
      await tx.notification.deleteMany({ where: { userId: currentUser.id } });

      // Pets without any historical appointment can be removed entirely. Pets
      // referenced by historical clinical records are pseudonymized instead so
      // referential integrity and veterinary record continuity remain intact.
      const pets = await tx.pet.findMany({
        where: { ownerId: currentUser.id },
        select: {
          id: true,
          appointments: { select: { id: true }, take: 1 },
        },
      });
      for (const pet of pets) {
        if (pet.appointments.length === 0) {
          await tx.pet.delete({ where: { id: pet.id } });
        } else {
          await tx.pet.update({
            where: { id: pet.id },
            data: {
              name: "Mascota eliminada",
              breed: null,
              weight: null,
              birthDate: null,
              photo: null,
              notes: null,
              healthProfile: null,
              healthProfileUpdatedAt: null,
            },
          });
        }
      }

      if (currentUser.vetProfile) {
        // Stop every operational surface immediately while retaining only the
        // minimum professional record needed to preserve historical services
        // and verification traceability where retention is required.
        await tx.price.updateMany({
          where: { vetId: currentUser.vetProfile.id },
          data: { isActive: false },
        });
        await tx.vetSchedule.deleteMany({
          where: { vetProfileId: currentUser.vetProfile.id },
        });
        await tx.scheduleException.deleteMany({
          where: { vetProfileId: currentUser.vetProfile.id },
        });
        await tx.vetProfile.update({
          where: { id: currentUser.vetProfile.id },
          data: {
            isActive: false,
            isAvailableNow: false,
            bio: null,
            latitude: null,
            longitude: null,
            city: null,
            department: null,
          },
        });
      }

      // The User row remains as a pseudonymous anchor for immutable historical
      // appointments/messages/reviews/financial records. Authentication and
      // direct identifiers are removed and the account becomes unusable.
      await tx.user.update({
        where: { id: currentUser.id },
        data: {
          email: anonymizedEmail,
          passwordHash: null,
          ctgUserId: null,
          firstName: "Cuenta",
          lastName: "Eliminada",
          phone: null,
          avatar: null,
          ctgBalance: 0,
          emailVerified: false,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          passwordChangedAt: deletedAt,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorEnrolledAt: null,
          recoveryCodesHash: [],
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          lastLoginIp: null,
          lastLoginUserAgent: null,
          isActive: false,
          deactivatedAt: deletedAt,
        },
      });

      return {
        deletedAt,
        actorRole: currentUser.role,
      };
    });

    // Keep the audit event pseudonymous: no email, name, IP or user-agent is
    // duplicated into the immutable audit trail by this deletion action.
    await this.auditService.log({
      actor: { id: user.id, role: outcome.actorRole },
      action: AuditAction.USER_DELETED,
      severity: AuditSeverity.WARN,
      targetType: "User",
      targetId: user.id,
      reason: "self_service_account_deletion",
      metadata: {
        deletionMode: "pseudonymize_with_regulated_record_retention",
        retainedCategories: [
          "clinical_history",
          "financial_records",
          "professional_verification",
          "audit",
        ],
      },
    });

    return {
      deleted: true,
      deletedAt: outcome.deletedAt.toISOString(),
      message:
        "Tu cuenta fue eliminada. Los registros clínicos, financieros, profesionales o de auditoría que deban conservarse permanecen pseudonimizados y ya no permiten iniciar sesión.",
    };
  }

  private async loadUser(userId: string): Promise<DeletionUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vetProfile: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Cuenta no disponible");
    }
    return user;
  }

  private async assertReauthentication(
    user: DeletionUser,
    dto: DeleteAccountDto,
  ) {
    if (user.passwordHash) {
      if (!dto.currentPassword) {
        throw new BadRequestException(
          "Debes confirmar tu contraseña actual antes de eliminar la cuenta.",
        );
      }
      const verified = await this.passwordService.verify(
        dto.currentPassword,
        user.passwordHash,
      );
      if (!verified.valid) {
        throw new UnauthorizedException("Contraseña actual incorrecta");
      }
    }

    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        throw new BadRequestException(
          "Debes confirmar el código de autenticación de dos factores.",
        );
      }
      try {
        await this.twoFactorService.verifyDuringLogin(
          user.id,
          dto.twoFactorCode,
        );
      } catch {
        throw new UnauthorizedException("Código del autenticador inválido");
      }
    }
  }

  private async collectBlockers(
    db: DeletionReadClient,
    user: DeletionUser,
  ): Promise<AccountDeletionBlocker[]> {
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN) {
      return [
        {
          code: "ADMIN_ACCOUNT",
          message:
            "Las cuentas administrativas no pueden eliminarse mediante el flujo de autoservicio móvil.",
        },
      ];
    }

    const [clientAppointments, clientTransactions] = await Promise.all([
      db.appointment.count({
        where: {
          clientId: user.id,
          status: { in: ACTIVE_APPOINTMENT_STATUSES },
        },
      }),
      db.transaction.count({
        where: {
          status: { in: UNRESOLVED_TRANSACTION_STATUSES },
          appointment: { clientId: user.id },
        },
      }),
    ]);

    let vetAppointments = 0;
    let vetTransactions = 0;
    let openWithdrawals = 0;
    let availableVetCop = 0;

    if (user.vetProfile) {
      const [
        vetAppointmentCount,
        vetTransactionCount,
        openWithdrawalCount,
        liquidated,
        committedWithdrawals,
      ] = await Promise.all([
        db.appointment.count({
          where: {
            vetId: user.vetProfile.id,
            status: { in: ACTIVE_APPOINTMENT_STATUSES },
          },
        }),
        db.transaction.count({
          where: {
            status: { in: UNRESOLVED_TRANSACTION_STATUSES },
            appointment: { vetId: user.vetProfile.id },
          },
        }),
        db.vetWithdrawal.count({
          where: {
            vetProfileId: user.vetProfile.id,
            status: { in: OPEN_WITHDRAWAL_STATUSES },
          },
        }),
        db.transaction.aggregate({
          where: {
            appointment: { vetId: user.vetProfile.id },
            status: TransactionStatus.LIQUIDATED,
          },
          _sum: { amountCop: true, commissionAmount: true },
        }),
        db.vetWithdrawal.aggregate({
          where: {
            vetProfileId: user.vetProfile.id,
            status: { in: COMMITTED_WITHDRAWAL_STATUSES },
          },
          _sum: { amountCop: true },
        }),
      ]);

      vetAppointments = vetAppointmentCount;
      vetTransactions = vetTransactionCount;
      openWithdrawals = openWithdrawalCount;

      // Keep this equivalent to the canonical financial withdrawal balance:
      // liquidated net earnings minus committed/paid withdrawals. Positive
      // available COP remains withdrawable and therefore blocks deletion.
      const earnedCop =
        (liquidated._sum.amountCop ?? 0) -
        (liquidated._sum.commissionAmount ?? 0);
      const committedCop = committedWithdrawals._sum.amountCop ?? 0;
      availableVetCop = Math.max(0, earnedCop - committedCop);
    }

    const blockers: AccountDeletionBlocker[] = [];
    const activeAppointments = clientAppointments + vetAppointments;
    if (activeAppointments > 0) {
      blockers.push({
        code: "ACTIVE_APPOINTMENTS",
        count: activeAppointments,
        message:
          "Finaliza o cancela las citas activas y resuelve cualquier disputa antes de eliminar la cuenta.",
      });
    }

    const unresolvedTransactions = clientTransactions + vetTransactions;
    if (unresolvedTransactions > 0) {
      blockers.push({
        code: "UNRESOLVED_TRANSACTIONS",
        count: unresolvedTransactions,
        message:
          "Existen pagos pendientes, en verificación, confirmados pendientes de liquidación o en disputa que deben resolverse antes de eliminar la cuenta.",
      });
    }

    if (
      Math.abs(user.ctgBalance) > BALANCE_EPSILON ||
      Math.abs(user.vetProfile?.ctgBalance ?? 0) > BALANCE_EPSILON ||
      availableVetCop > BALANCE_EPSILON
    ) {
      blockers.push({
        code: "WALLET_BALANCE",
        message:
          "Retira o regulariza los saldos CTG y COP disponibles antes de eliminar la cuenta.",
      });
    }

    if (openWithdrawals > 0) {
      blockers.push({
        code: "OPEN_WITHDRAWALS",
        count: openWithdrawals,
        message:
          "Hay retiros pendientes de procesamiento. Espera su resolución antes de eliminar la cuenta.",
      });
    }

    return blockers;
  }

  private async withSerializableRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === "P2034" && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException(
      "La cuenta cambió durante la eliminación. Intenta nuevamente.",
    );
  }

  private createExternalDeletionCode(userId: string): string {
    const expiresAt =
      Math.floor(Date.now() / 1000) + EXTERNAL_DELETION_TTL_SECONDS;
    const signature = this.signExternalDeletionCode(userId, expiresAt);
    return `${expiresAt}.${signature}`;
  }

  private verifyExternalDeletionCode(userId: string, code: string): void {
    const [rawExpiresAt, signature] = code.split(".");
    const expiresAt = Number(rawExpiresAt);
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isInteger(expiresAt) ||
      expiresAt <= now ||
      expiresAt > now + EXTERNAL_DELETION_TTL_SECONDS + 60 ||
      !/^[a-f0-9]{32}$/i.test(signature ?? "")
    ) {
      throw new UnauthorizedException("Código inválido o expirado");
    }

    const expected = this.signExternalDeletionCode(userId, expiresAt);
    const actualBuffer = Buffer.from(signature.toLowerCase(), "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException("Código inválido o expirado");
    }
  }

  private signExternalDeletionCode(userId: string, expiresAt: number): string {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new InternalServerErrorException(
        "Account deletion signing boundary is not configured",
      );
    }
    const scopedKey = crypto
      .createHash("sha256")
      .update(`${jwtSecret}:nvet-account-deletion-v1`)
      .digest();
    return crypto
      .createHmac("sha256", scopedKey)
      .update(`${userId}.${expiresAt}`)
      .digest("hex")
      .slice(0, 32);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
