import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TransactionStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TransactionFiltersDto } from "./dto/payment.dto";

/**
 * Read-model boundary for endpoints whose visibility depends on the role that
 * JwtStrategy resolved for the CURRENT request.
 *
 * Do not derive authorization from `users.role` here: the canonical root may
 * intentionally be operating as CLIENT for this request while its persistent
 * singleton authority remains SUPERADMIN. Controllers pass `req.user.role`,
 * which is already fail-closed and identity-validated by JwtStrategy.
 */
@Injectable()
export class EffectiveRolePaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: string, effectiveRole: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vetProfile: true },
    });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    if (effectiveRole === UserRole.VET && user.vetProfile) {
      const liquidated = await this.prisma.transaction.aggregate({
        where: {
          appointment: { vetId: user.vetProfile.id },
          status: TransactionStatus.LIQUIDATED,
        },
        _sum: { amountCop: true, commissionAmount: true },
      });
      const pending = await this.prisma.transaction.aggregate({
        where: {
          appointment: { vetId: user.vetProfile.id },
          status: TransactionStatus.CONFIRMED,
        },
        _sum: { amountCop: true, commissionAmount: true },
      });
      const earnings =
        (liquidated._sum.amountCop ?? 0) -
        (liquidated._sum.commissionAmount ?? 0);
      const pendingCop =
        (pending._sum.amountCop ?? 0) - (pending._sum.commissionAmount ?? 0);

      return {
        ctgBalance: user.vetProfile.ctgBalance,
        copBalance: earnings,
        pendingCtg: 0,
        pendingCop,
      };
    }

    return {
      ctgBalance: user.ctgBalance,
      copBalance: 0,
      pendingCtg: 0,
      pendingCop: 0,
    };
  }

  async getTransactions(
    userId: string,
    effectiveRole: UserRole,
    filters: TransactionFiltersDto,
  ) {
    const where: Prisma.TransactionWhereInput = {};

    if (effectiveRole === UserRole.CLIENT) {
      where.appointment = { clientId: userId };
    } else if (effectiveRole === UserRole.VET) {
      const vetProfile = await this.prisma.vetProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      // A VET without a profile must fail closed to an empty result, never to
      // an unscoped global read.
      where.appointment = vetProfile
        ? { vetId: vetProfile.id }
        : { vetId: "00000000-0000-0000-0000-000000000000" };
    }

    if (filters.status) where.status = filters.status;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const [results, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          appointment: {
            include: {
              client: { select: { id: true, firstName: true, lastName: true } },
              vet: {
                include: {
                  user: { select: { firstName: true, lastName: true } },
                },
              },
              pet: { select: { id: true, name: true, species: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: filters.limit ?? 20,
        skip: filters.offset ?? 0,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      results,
      total,
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
      hasMore: (filters.offset ?? 0) + results.length < total,
    };
  }

  async getTransactionById(
    userId: string,
    effectiveRole: UserRole,
    transactionId: string,
  ) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        appointment: {
          include: { vet: true, client: true, pet: true },
        },
      },
    });
    if (!transaction) throw new NotFoundException("Transacción no encontrada");

    const isClient = transaction.appointment.clientId === userId;
    const isVet = transaction.appointment.vet.userId === userId;
    const isAdmin =
      effectiveRole === UserRole.ADMIN || effectiveRole === UserRole.SUPERADMIN;

    if (!isClient && !isVet && !isAdmin) {
      throw new ForbiddenException("No tienes acceso a esta transacción");
    }

    return transaction;
  }
}
