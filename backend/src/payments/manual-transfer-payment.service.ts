import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  PaymentMethod,
  TransactionStatus,
  UserRole,
} from "@prisma/client";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import type { VerifyTransferDto } from "./dto/payment.dto";

const CUSTOMER_SERVICE_WHATSAPP = "3186428218";

@Injectable()
export class ManualTransferPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async submitClientProof(
    userId: string,
    transactionId: string,
    file: Express.Multer.File,
    dto: VerifyTransferDto,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("El comprobante es obligatorio");
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        appointment: {
          include: {
            client: true,
            pet: true,
            vet: { include: { user: true } },
          },
        },
      },
    });

    if (!transaction) throw new NotFoundException("Transacción no encontrada");
    if (transaction.appointment.clientId !== userId) {
      throw new ForbiddenException(
        "Solo el usuario que solicitó el servicio puede subir el comprobante",
      );
    }
    if (transaction.paymentMethod !== PaymentMethod.TRANSFER) {
      throw new BadRequestException("Solo aplicable a pagos por transferencia");
    }
    if (transaction.status !== TransactionStatus.PENDING) {
      throw new ConflictException(
        `La transferencia no admite comprobante en estado ${transaction.status}`,
      );
    }

    const uploaded = await this.storage.upload(
      file,
      `transfers/${transactionId}`,
      { visibility: "private" },
    );
    const proofSha256 = createHash("sha256").update(file.buffer).digest("hex");

    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: TransactionStatus.VERIFYING,
        transferCode: dto.transferCode.trim(),
        transferDate: dto.transferDate ? new Date(dto.transferDate) : null,
        transferSubmittedAt: new Date(),
        transferProofStorageKey: uploaded.storageKey,
        transferProofFileName: this.sanitizeFileName(file.originalname),
        transferProofMimeType: file.mimetype,
        transferProofSha256: proofSha256,
        transferReviewedById: null,
        transferRejectedAt: null,
        transferRejectionReason: null,
      },
    });

    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.SUPERADMIN] },
        isActive: true,
      },
      select: { id: true },
    });

    if (admins.length > 0) {
      const occurredAt = new Date();
      await this.prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          dedupeKey: `manual-transfer:${transactionId}:submitted`,
          type: "TRANSFER_PROOF_SUBMITTED",
          category: "PAYMENTS",
          title: "Transferencia pendiente de validación",
          message: `${transaction.appointment.client.firstName ?? "Un usuario"} subió el comprobante del servicio ${transaction.appointment.serviceType}.`,
          actionPath: `/admin/payments/transfers/${transactionId}`,
          metadata: {
            transactionId,
            appointmentId: transaction.appointmentId,
            amountCop: transaction.amountCop,
            petName: transaction.appointment.pet.name,
          },
          occurredAt,
        })),
        skipDuplicates: true,
      });
    }

    return updated;
  }

  async approve(adminUserId: string, transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        appointment: {
          include: {
            client: true,
            pet: true,
            vet: { include: { user: true } },
          },
        },
      },
    });

    if (!transaction) throw new NotFoundException("Transacción no encontrada");
    if (transaction.paymentMethod !== PaymentMethod.TRANSFER) {
      throw new BadRequestException("Solo aplicable a pagos por transferencia");
    }
    if (transaction.status !== TransactionStatus.VERIFYING) {
      throw new ConflictException(
        `La transferencia no puede aprobarse en estado ${transaction.status}`,
      );
    }
    if (!transaction.transferProofStorageKey) {
      throw new ConflictException("No existe comprobante para validar");
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.CONFIRMED,
          verifiedAt: now,
          transferReviewedById: adminUserId,
          transferRejectedAt: null,
          transferRejectionReason: null,
        },
      });

      await tx.appointment.update({
        where: { id: transaction.appointmentId },
        data: {
          status: AppointmentStatus.CONFIRMED,
          confirmedAt: now,
          lastStatusChangeAt: now,
        },
      });

      await tx.notification.upsert({
        where: {
          userId_dedupeKey: {
            userId: transaction.appointment.clientId,
            dedupeKey: `manual-transfer:${transactionId}:approved:client`,
          },
        },
        update: { occurredAt: now, readAt: null },
        create: {
          userId: transaction.appointment.clientId,
          dedupeKey: `manual-transfer:${transactionId}:approved:client`,
          type: "TRANSFER_APPROVED",
          category: "PAYMENTS",
          title: "Pago aprobado y servicio confirmado",
          message: `Validamos tu transferencia. El servicio ${transaction.appointment.serviceType} para ${transaction.appointment.pet.name} quedó confirmado.`,
          actionPath: `/appointments/${transaction.appointmentId}`,
          metadata: { transactionId, appointmentId: transaction.appointmentId },
          occurredAt: now,
        },
      });

      await tx.notification.upsert({
        where: {
          userId_dedupeKey: {
            userId: transaction.appointment.vet.userId,
            dedupeKey: `manual-transfer:${transactionId}:approved:vet`,
          },
        },
        update: { occurredAt: now, readAt: null },
        create: {
          userId: transaction.appointment.vet.userId,
          dedupeKey: `manual-transfer:${transactionId}:approved:vet`,
          type: "SERVICE_CONFIRMED",
          category: "APPOINTMENTS",
          title: "Nuevo servicio confirmado",
          message: `${transaction.appointment.serviceType} para ${transaction.appointment.pet.name} fue pagado y confirmado.`,
          actionPath: `/appointments/${transaction.appointmentId}`,
          metadata: {
            appointmentId: transaction.appointmentId,
            serviceType: transaction.appointment.serviceType,
            date: transaction.appointment.date,
            time: transaction.appointment.time,
            address: transaction.appointment.address,
            petId: transaction.appointment.petId,
            petName: transaction.appointment.pet.name,
            clientId: transaction.appointment.clientId,
            clientName: `${transaction.appointment.client.firstName ?? ""} ${transaction.appointment.client.lastName ?? ""}`.trim(),
            notes: transaction.appointment.notes,
          },
          occurredAt: now,
        },
      });

      return payment;
    });

    return updated;
  }

  async reject(adminUserId: string, transactionId: string, reason: string) {
    const normalizedReason = reason?.trim();
    if (!normalizedReason || normalizedReason.length < 10 || normalizedReason.length > 500) {
      throw new BadRequestException(
        "La razón de rechazo debe tener entre 10 y 500 caracteres",
      );
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { appointment: true },
    });
    if (!transaction) throw new NotFoundException("Transacción no encontrada");
    if (transaction.paymentMethod !== PaymentMethod.TRANSFER) {
      throw new BadRequestException("Solo aplicable a pagos por transferencia");
    }
    if (transaction.status !== TransactionStatus.VERIFYING) {
      throw new ConflictException(
        `La transferencia no puede rechazarse en estado ${transaction.status}`,
      );
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.FAILED,
          transferReviewedById: adminUserId,
          transferRejectedAt: now,
          transferRejectionReason: normalizedReason,
        },
      });

      await tx.notification.upsert({
        where: {
          userId_dedupeKey: {
            userId: transaction.appointment.clientId,
            dedupeKey: `manual-transfer:${transactionId}:rejected`,
          },
        },
        update: {
          occurredAt: now,
          readAt: null,
          message: `No pudimos validar la transferencia: ${normalizedReason}. Contacta a Servicio al Cliente por WhatsApp al ${CUSTOMER_SERVICE_WHATSAPP} para verificar el pago.`,
        },
        create: {
          userId: transaction.appointment.clientId,
          dedupeKey: `manual-transfer:${transactionId}:rejected`,
          type: "TRANSFER_REJECTED",
          category: "PAYMENTS",
          title: "No pudimos validar tu transferencia",
          message: `No pudimos validar la transferencia: ${normalizedReason}. Contacta a Servicio al Cliente por WhatsApp al ${CUSTOMER_SERVICE_WHATSAPP} para verificar el pago.`,
          actionPath: `/appointments/${transaction.appointmentId}`,
          metadata: {
            transactionId,
            appointmentId: transaction.appointmentId,
            reason: normalizedReason,
            customerServiceWhatsapp: CUSTOMER_SERVICE_WHATSAPP,
          },
          occurredAt: now,
        },
      });

      return updated;
    });
  }

  private sanitizeFileName(value: string): string {
    return (value || "comprobante")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);
  }
}
