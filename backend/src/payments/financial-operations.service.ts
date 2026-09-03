import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TransactionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  PayoutDestination,
  FinancialDataCryptoService,
} from "./financial-data-crypto.service";
import type { RequestWithdrawalDto } from "./dto/payment.dto";

export const WITHDRAWAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "PROCESSING",
  "PAID",
  "REJECTED",
  "CANCELLED",
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

const COMMITTED_WITHDRAWAL_STATUSES: WithdrawalStatus[] = [
  "PENDING",
  "APPROVED",
  "PROCESSING",
  "PAID",
];

const WITHDRAWAL_TRANSITIONS: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PROCESSING", "REJECTED", "CANCELLED"],
  PROCESSING: ["PAID"],
  PAID: [],
  REJECTED: [],
  CANCELLED: [],
};

@Injectable()
export class FinancialOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financialCrypto: FinancialDataCryptoService,
  ) {}

  async requestWithdrawal(userId: string, dto: RequestWithdrawalDto) {
    this.validateDestination(dto.paymentMethod, dto.accountInfo);

    // Encryption happens before opening the serializable transaction so no
    // plaintext destination is ever handed to Prisma or persisted in logs.
    const destination = dto.accountInfo as PayoutDestination;
    const encryptedDestination = this.financialCrypto.encrypt(destination);
    const destinationFingerprint = this.financialCrypto.fingerprint(destination);
    const destinationMasked = this.financialCrypto.mask(destination);

    return this.withSerializableRetry(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { vetProfile: true },
      });
      if (!user?.vetProfile) {
        throw new ForbiddenException("Solo veterinarios pueden solicitar retiros");
      }

      const balance = await this.calculateWithdrawalBalance(
        tx,
        user.vetProfile.id,
      );
      if (dto.amountCop > balance.availableCop) {
        throw new BadRequestException(
          `Saldo insuficiente. Disponible: ${balance.availableCop.toLocaleString("es-CO")} COP`,
        );
      }

      const withdrawal = await tx.vetWithdrawal.create({
        data: {
          vetProfileId: user.vetProfile.id,
          amountCop: dto.amountCop,
          method: dto.paymentMethod,
          status: "PENDING",
          destinationCiphertext: encryptedDestination,
          destinationFingerprint,
          destinationMasked,
          requestedById: userId,
        },
      });

      return {
        withdrawal: this.toSafeWithdrawal(withdrawal),
        balance: {
          ...balance,
          reservedCop: balance.reservedCop + dto.amountCop,
          availableCop: balance.availableCop - dto.amountCop,
        },
      };
    });
  }

  async listMyWithdrawals(userId: string, limit = 20, offset = 0) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!vet) throw new ForbiddenException("Solo veterinarios");

    const [rows, total] = await Promise.all([
      this.prisma.vetWithdrawal.findMany({
        where: { vetProfileId: vet.id },
        orderBy: { requestedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.vetWithdrawal.count({ where: { vetProfileId: vet.id } }),
    ]);

    return {
      results: rows.map((row) => this.toSafeWithdrawal(row)),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  async cancelMyWithdrawal(userId: string, withdrawalId: string) {
    return this.withSerializableRetry(async (tx) => {
      const withdrawal = await tx.vetWithdrawal.findUnique({
        where: { id: withdrawalId },
        include: { vetProfile: { select: { userId: true } } },
      });
      if (!withdrawal) throw new NotFoundException("Retiro no encontrado");
      if (withdrawal.vetProfile.userId !== userId) {
        throw new ForbiddenException("No tienes acceso a este retiro");
      }
      this.assertWithdrawalTransition(withdrawal.status, "CANCELLED");

      const updated = await tx.vetWithdrawal.update({
        where: { id: withdrawalId },
        data: { status: "CANCELLED" },
      });
      return this.toSafeWithdrawal(updated);
    });
  }

  async listAdminWithdrawals(
    status?: string,
    limit = 50,
    offset = 0,
  ) {
    if (status && !WITHDRAWAL_STATUSES.includes(status as WithdrawalStatus)) {
      throw new BadRequestException("Estado de retiro inválido");
    }

    const where = status ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.vetWithdrawal.findMany({
        where,
        include: {
          vetProfile: {
            select: {
              id: true,
              licenseNumber: true,
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { requestedAt: "asc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.vetWithdrawal.count({ where }),
    ]);

    return {
      results: rows.map((row) => this.toSafeWithdrawal(row)),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  async getPayoutInstructions(withdrawalId: string) {
    const withdrawal = await this.prisma.vetWithdrawal.findUnique({
      where: { id: withdrawalId },
      include: {
        vetProfile: {
          select: {
            id: true,
            licenseNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!withdrawal) throw new NotFoundException("Retiro no encontrado");
    if (["PAID", "REJECTED", "CANCELLED"].includes(withdrawal.status)) {
      throw new ConflictException(
        "Las instrucciones completas no se exponen para retiros terminales",
      );
    }

    return {
      ...this.toSafeWithdrawal(withdrawal),
      destination: this.financialCrypto.decrypt(
        withdrawal.destinationCiphertext,
      ),
    };
  }

  async approveWithdrawal(adminUserId: string, withdrawalId: string) {
    return this.transitionWithdrawal(
      withdrawalId,
      "APPROVED",
      {
        approvedById: adminUserId,
        approvedAt: new Date(),
        rejectionReason: null,
        rejectedAt: null,
      },
    );
  }

  async markWithdrawalProcessing(adminUserId: string, withdrawalId: string) {
    return this.transitionWithdrawal(
      withdrawalId,
      "PROCESSING",
      {
        processingAt: new Date(),
        approvedById: adminUserId,
      },
    );
  }

  async markWithdrawalPaid(
    adminUserId: string,
    withdrawalId: string,
    paymentReference: string,
  ) {
    const reference = paymentReference.trim();
    if (reference.length < 6 || reference.length > 120) {
      throw new BadRequestException(
        "La referencia de pago debe tener entre 6 y 120 caracteres",
      );
    }

    return this.transitionWithdrawal(withdrawalId, "PAID", {
      paidById: adminUserId,
      paidAt: new Date(),
      paymentReference: reference,
    });
  }

  async rejectWithdrawal(
    adminUserId: string,
    withdrawalId: string,
    reason: string,
  ) {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) {
      throw new BadRequestException(
        "La razón de rechazo debe tener entre 10 y 500 caracteres",
      );
    }

    const current = await this.prisma.vetWithdrawal.findUnique({
      where: { id: withdrawalId },
      select: { status: true },
    });
    if (!current) throw new NotFoundException("Retiro no encontrado");
    if (!(["PENDING", "APPROVED"] as string[]).includes(current.status)) {
      throw new BadRequestException(
        `No se puede rechazar un retiro en estado ${current.status}`,
      );
    }

    return this.transitionWithdrawal(withdrawalId, "REJECTED", {
      approvedById: adminUserId,
      rejectedAt: new Date(),
      rejectionReason: normalizedReason,
    });
  }

  async getBalanceForVet(vetProfileId: string) {
    return this.calculateWithdrawalBalance(this.prisma, vetProfileId);
  }

  private async transitionWithdrawal(
    withdrawalId: string,
    next: WithdrawalStatus,
    data: Record<string, unknown>,
  ) {
    return this.withSerializableRetry(async (tx) => {
      const current = await tx.vetWithdrawal.findUnique({
        where: { id: withdrawalId },
      });
      if (!current) throw new NotFoundException("Retiro no encontrado");
      this.assertWithdrawalTransition(current.status, next);

      const updated = await tx.vetWithdrawal.update({
        where: { id: withdrawalId },
        data: { ...data, status: next },
      });
      return this.toSafeWithdrawal(updated);
    });
  }

  private async calculateWithdrawalBalance(
    tx: Pick<Prisma.TransactionClient, "transaction" | "vetWithdrawal"> | PrismaService,
    vetProfileId: string,
  ) {
    const [liquidated, committed, paid] = await Promise.all([
      tx.transaction.aggregate({
        where: {
          appointment: { vetId: vetProfileId },
          status: TransactionStatus.LIQUIDATED,
        },
        _sum: { amountCop: true, commissionAmount: true },
      }),
      tx.vetWithdrawal.aggregate({
        where: {
          vetProfileId,
          status: { in: COMMITTED_WITHDRAWAL_STATUSES },
        },
        _sum: { amountCop: true },
      }),
      tx.vetWithdrawal.aggregate({
        where: { vetProfileId, status: "PAID" },
        _sum: { amountCop: true },
      }),
    ]);

    const earnedCop =
      (liquidated._sum.amountCop ?? 0) -
      (liquidated._sum.commissionAmount ?? 0);
    const reservedCop = committed._sum.amountCop ?? 0;
    const paidCop = paid._sum.amountCop ?? 0;

    return {
      earnedCop,
      reservedCop,
      paidCop,
      availableCop: Math.max(0, earnedCop - reservedCop),
    };
  }

  private validateDestination(method: string, destination: PayoutDestination) {
    if (!destination?.documentId?.trim()) {
      throw new BadRequestException("El documento del titular es obligatorio");
    }

    if (method === "BANK_TRANSFER") {
      if (
        !destination.bankName?.trim() ||
        !destination.accountNumber?.trim() ||
        !destination.accountType
      ) {
        throw new BadRequestException(
          "Para transferencia bancaria se requieren banco, número y tipo de cuenta",
        );
      }
      return;
    }

    if (method === "NEQUI" || method === "DAVIPLATA") {
      if (!destination.phoneNumber?.trim()) {
        throw new BadRequestException(
          "Para billetera móvil se requiere el número de teléfono",
        );
      }
      return;
    }

    throw new BadRequestException("Método de retiro no soportado");
  }

  private assertWithdrawalTransition(current: string, next: WithdrawalStatus) {
    if (
      !WITHDRAWAL_STATUSES.includes(current as WithdrawalStatus) ||
      !WITHDRAWAL_TRANSITIONS[current as WithdrawalStatus].includes(next)
    ) {
      throw new BadRequestException(
        `Transición de retiro inválida: ${current} → ${next}`,
      );
    }
  }

  private toSafeWithdrawal<T extends Record<string, any>>(withdrawal: T) {
    const {
      destinationCiphertext: _destinationCiphertext,
      destinationFingerprint: _destinationFingerprint,
      ...safe
    } = withdrawal;
    return safe;
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
    throw new ConflictException("No se pudo reservar el saldo del retiro");
  }
}
