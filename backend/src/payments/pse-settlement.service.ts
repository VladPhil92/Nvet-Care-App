import { Injectable, Logger } from "@nestjs/common";
import {
  AppointmentStatus,
  PaymentMethod,
  TransactionStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { PseWebhookPayload } from "./payments.service";

/**
 * PSE settlement deliberately relies on the persisted transaction state for
 * idempotency instead of caching only `externalTransactionId`.
 *
 * A provider commonly reuses the same external transaction id while moving
 * PENDING -> APPROVED. Caching by external id alone would swallow the final
 * approval. Repeated events that request the already-applied target state are
 * therefore acknowledged as no-ops, while later legitimate state changes can
 * still progress.
 */
@Injectable()
export class PseSettlementService {
  private readonly logger = new Logger(PseSettlementService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(payload: PseWebhookPayload): Promise<void> {
    const { externalTransactionId, transactionId, status, amount } = payload;

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { appointment: true },
    });

    if (!transaction) {
      this.logger.warn(
        `PSE webhook ignored: transaction=${transactionId} not found extId=${externalTransactionId}`,
      );
      return;
    }

    if (transaction.paymentMethod !== PaymentMethod.PSE) {
      this.logger.warn(
        `PSE webhook ignored for non-PSE transaction=${transactionId} method=${transaction.paymentMethod}`,
      );
      return;
    }

    if (amount !== undefined && Math.abs(amount - transaction.amountCop) > 1) {
      this.logger.error(
        `PSE amount mismatch transaction=${transactionId} expected=${transaction.amountCop} received=${amount}`,
      );
      return;
    }

    const normalized = status.trim().toUpperCase();

    if (normalized === "PENDING") {
      return;
    }

    const target = this.targetStatus(normalized);
    if (!target) {
      this.logger.warn(
        `PSE webhook ignored: unknown status=${status} transaction=${transactionId}`,
      );
      return;
    }

    if (transaction.status === target) {
      return;
    }

    const paymentAlreadySettled =
      transaction.status === TransactionStatus.CONFIRMED ||
      transaction.status === TransactionStatus.LIQUIDATED;

    if (target === TransactionStatus.FAILED && paymentAlreadySettled) {
      this.logger.warn(
        `PSE late failure ignored transaction=${transactionId} current=${transaction.status}`,
      );
      return;
    }

    const allowed =
      transaction.status === TransactionStatus.PENDING ||
      transaction.status === TransactionStatus.VERIFYING;

    if (!allowed) {
      this.logger.warn(
        `PSE transition ignored transaction=${transactionId} ${transaction.status}->${target}`,
      );
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: target,
          ...(target === TransactionStatus.CONFIRMED
            ? { verifiedAt: new Date() }
            : {}),
        },
      });

      if (target === TransactionStatus.CONFIRMED) {
        await tx.appointment.update({
          where: { id: transaction.appointmentId },
          data: { status: AppointmentStatus.CONFIRMED },
        });
      }
    });

    this.logger.log(
      `PSE settled transaction=${transactionId} ${transaction.status}->${target} extId=${externalTransactionId}`,
    );
  }

  private targetStatus(status: string): TransactionStatus | null {
    switch (status) {
      case "APPROVED":
        return TransactionStatus.CONFIRMED;
      case "DECLINED":
      case "EXPIRED":
      case "FAILED":
        return TransactionStatus.FAILED;
      default:
        return null;
    }
  }
}
