import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  AuditAction,
  AuditSeverity,
  Prisma,
  ReportStatus,
  TransactionStatus,
  UserRole,
  VerificationStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import {
  AdminUsersFiltersDto,
  AuditLogFiltersDto,
  ReviewVetVerificationDto,
  UpdateUserStatusDto,
  UpdateVetStatusDto,
} from "./dto/admin.dto";

export interface GovernanceActionContext {
  ip?: string;
  userAgent?: string;
  role?: string;
}

@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getOverview() {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      usersByRole,
      vetsByVerification,
      appointmentsByStatus,
      transactionsByStatus,
      criticalAudit24h,
      openMessageReports,
      activeSessions,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.groupBy({ by: ["role"], _count: true }),
      this.prisma.vetProfile.groupBy({
        by: ["verificationStatus"],
        _count: true,
      }),
      this.prisma.appointment.groupBy({ by: ["status"], _count: true }),
      this.prisma.transaction.groupBy({ by: ["status"], _count: true }),
      this.prisma.auditLog.count({
        where: {
          severity: AuditSeverity.CRITICAL,
          createdAt: { gte: last24h },
        },
      }),
      this.prisma.messageReport.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.userSession.count({
        where: { revokedAt: null, expiresAt: { gt: now } },
      }),
    ]);

    const roleCounts = Object.fromEntries(
      usersByRole.map((row) => [row.role, row._count]),
    ) as Record<UserRole, number>;
    const verificationCounts = Object.fromEntries(
      vetsByVerification.map((row) => [row.verificationStatus, row._count]),
    ) as Record<VerificationStatus, number>;
    const appointmentCounts = Object.fromEntries(
      appointmentsByStatus.map((row) => [row.status, row._count]),
    ) as Record<AppointmentStatus, number>;
    const transactionCounts = Object.fromEntries(
      transactionsByStatus.map((row) => [row.status, row._count]),
    ) as Record<TransactionStatus, number>;

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        byRole: roleCounts,
      },
      veterinarians: {
        pendingReview:
          (verificationCounts[VerificationStatus.PENDING] ?? 0) +
          (verificationCounts[VerificationStatus.IN_REVIEW] ?? 0),
        approved: verificationCounts[VerificationStatus.APPROVED] ?? 0,
        rejected: verificationCounts[VerificationStatus.REJECTED] ?? 0,
        byVerification: verificationCounts,
      },
      appointments: {
        active:
          (appointmentCounts[AppointmentStatus.PENDING] ?? 0) +
          (appointmentCounts[AppointmentStatus.CONFIRMED] ?? 0) +
          (appointmentCounts[AppointmentStatus.IN_PROGRESS] ?? 0),
        disputed: appointmentCounts[AppointmentStatus.DISPUTED] ?? 0,
        byStatus: appointmentCounts,
      },
      finance: {
        pending:
          (transactionCounts[TransactionStatus.PENDING] ?? 0) +
          (transactionCounts[TransactionStatus.VERIFYING] ?? 0),
        disputed: transactionCounts[TransactionStatus.DISPUTED] ?? 0,
        failed: transactionCounts[TransactionStatus.FAILED] ?? 0,
        byStatus: transactionCounts,
      },
      security: {
        criticalAudit24h,
        activeSessions,
      },
      moderation: {
        openMessageReports,
      },
      generatedAt: now.toISOString(),
    };
  }

  async getUsers(filters: AdminUsersFiltersDto) {
    const where: Prisma.UserWhereInput = {};
    if (filters.role) where.role = filters.role;
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive === "true";
    }
    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: "insensitive" } },
        { firstName: { contains: filters.search, mode: "insensitive" } },
        { lastName: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const limit = filters.limit ?? 25;
    const offset = filters.offset ?? 0;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          emailVerified: true,
          twoFactorEnabled: true,
          isActive: true,
          deactivatedAt: true,
          lastLoginAt: true,
          createdAt: true,
          ctgUserId: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      results: users.map(({ ctgUserId, ...user }) => ({
        ...user,
        ctgLinked: Boolean(ctgUserId),
      })),
      total,
      limit,
      offset,
      hasMore: offset + users.length < total,
    };
  }

  async updateUserStatus(
    actorId: string,
    userId: string,
    dto: UpdateUserStatusDto,
    ctx: GovernanceActionContext = {},
  ) {
    if (actorId === userId && !dto.isActive) {
      throw new BadRequestException(
        "La identidad SUPERADMIN no puede desactivarse a sí misma",
      );
    }

    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true, deactivatedAt: true },
    });
    if (!current) throw new NotFoundException("Usuario no encontrado");
    if (current.isActive === dto.isActive) return current;

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          isActive: dto.isActive,
          deactivatedAt: dto.isActive ? null : now,
        },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          deactivatedAt: true,
        },
      });

      if (!dto.isActive) {
        await tx.userSession.updateMany({
          where: { userId, revokedAt: null },
          data: {
            revokedAt: now,
            revokedReason: "superadmin_account_deactivation",
          },
        });
      }

      return user;
    });

    await this.auditService.log({
      actor: {
        id: actorId,
        role: ctx.role ?? UserRole.SUPERADMIN,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      action: AuditAction.CONFIG_CHANGED,
      severity: dto.isActive ? AuditSeverity.INFO : AuditSeverity.WARN,
      targetType: "User",
      targetId: userId,
      beforeData: { isActive: current.isActive },
      afterData: { isActive: updated.isActive },
      reason: dto.reason,
      metadata: {
        operation: dto.isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
      },
    });

    return updated;
  }

  async reviewVetVerification(
    actorId: string,
    vetId: string,
    dto: ReviewVetVerificationDto,
    ctx: GovernanceActionContext = {},
  ) {
    const current = await this.prisma.vetProfile.findUnique({
      where: { id: vetId },
    });
    if (!current) throw new NotFoundException("Veterinario no encontrado");

    const now = new Date();
    const next =
      dto.decision === "APPROVE"
        ? {
            verificationStatus: VerificationStatus.APPROVED,
            isVerified: true,
            verifiedAt: now,
            rejectionReason: null,
          }
        : dto.decision === "REJECT"
          ? {
              verificationStatus: VerificationStatus.REJECTED,
              isVerified: false,
              verifiedAt: null,
              rejectionReason: dto.reason,
            }
          : {
              verificationStatus: VerificationStatus.IN_REVIEW,
              isVerified: false,
              verifiedAt: null,
              rejectionReason: null,
            };

    const updated = await this.prisma.vetProfile.update({
      where: { id: vetId },
      data: next,
    });

    const action =
      dto.decision === "APPROVE"
        ? AuditAction.VET_VERIFICATION_APPROVED
        : dto.decision === "REJECT"
          ? AuditAction.VET_VERIFICATION_REJECTED
          : AuditAction.CONFIG_CHANGED;

    await this.auditService.log({
      actor: {
        id: actorId,
        role: ctx.role ?? UserRole.SUPERADMIN,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      action,
      severity: AuditSeverity.INFO,
      targetType: "VetProfile",
      targetId: vetId,
      beforeData: {
        verificationStatus: current.verificationStatus,
        isVerified: current.isVerified,
      },
      afterData: {
        verificationStatus: updated.verificationStatus,
        isVerified: updated.isVerified,
      },
      reason: dto.reason,
      metadata: { decision: dto.decision },
    });

    return updated;
  }

  async updateVetStatus(
    actorId: string,
    vetId: string,
    dto: UpdateVetStatusDto,
    ctx: GovernanceActionContext = {},
  ) {
    const current = await this.prisma.vetProfile.findUnique({
      where: { id: vetId },
    });
    if (!current) throw new NotFoundException("Veterinario no encontrado");
    if (current.isActive === dto.isActive) return current;

    const updated = await this.prisma.vetProfile.update({
      where: { id: vetId },
      data: {
        isActive: dto.isActive,
        isAvailableNow: dto.isActive ? current.isAvailableNow : false,
      },
    });

    await this.auditService.log({
      actor: {
        id: actorId,
        role: ctx.role ?? UserRole.SUPERADMIN,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      action: dto.isActive
        ? AuditAction.VET_REACTIVATED
        : AuditAction.VET_SUSPENDED,
      severity: dto.isActive ? AuditSeverity.INFO : AuditSeverity.WARN,
      targetType: "VetProfile",
      targetId: vetId,
      beforeData: { isActive: current.isActive },
      afterData: { isActive: updated.isActive },
      reason: dto.reason,
    });

    return updated;
  }

  async getAuditLog(filters: AuditLogFiltersDto) {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.severity) where.severity = filters.severity;
    if (filters.action) where.action = filters.action;
    if (filters.targetType) where.targetType = filters.targetType;

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    const [results, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          actorId: true,
          actorRole: true,
          action: true,
          severity: true,
          targetType: true,
          targetId: true,
          reason: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      results,
      total,
      limit,
      offset,
      hasMore: offset + results.length < total,
    };
  }
}
