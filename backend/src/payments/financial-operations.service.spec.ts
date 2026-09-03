import {
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  PaymentMethod,
  TransactionStatus,
} from "@prisma/client";
import { FinancialOperationsService } from "./financial-operations.service";

const TX_ID = "00000000-0000-4000-8000-000000000001";
const APPT_ID = "00000000-0000-4000-8000-000000000002";
const VET_ID = "00000000-0000-4000-8000-000000000003";
const VET_USER_ID = "00000000-0000-4000-8000-000000000004";

const pdfFile = {
  originalname: "proof.pdf",
  mimetype: "application/pdf",
  size: 12,
  buffer: Buffer.from("%PDF-1.4\nEOF"),
} as Express.Multer.File;

describe("FinancialOperationsService", () => {
  let prisma: any;
  let crypto: any;
  let storage: any;
  let service: FinancialOperationsService;

  beforeEach(() => {
    prisma = {
      transaction: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      appointment: { update: jest.fn() },
      financialSettlementBatch: { create: jest.fn() },
      vetWithdrawal: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      vetProfile: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(prisma)),
    };
    crypto = {
      encrypt: jest.fn().mockReturnValue("v1.encrypted"),
      decrypt: jest.fn().mockReturnValue({
        bankName: "Bancolombia",
        accountNumber: "1234567890",
        accountType: "SAVINGS",
        documentId: "123456789",
      }),
      fingerprint: jest.fn().mockReturnValue("f".repeat(64)),
      mask: jest.fn().mockReturnValue("Bancolombia ••••7890 · ID •••••6789"),
    };
    storage = {
      upload: jest.fn().mockResolvedValue({
        storageKey: "cloudinary:v1:private:raw:key",
      }),
      read: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new FinancialOperationsService(prisma, crypto, storage);
  });

  it("persists private TRANSFER evidence with an integrity hash", async () => {
    prisma.transaction.findUnique.mockResolvedValue({
      id: TX_ID,
      paymentMethod: PaymentMethod.TRANSFER,
      status: TransactionStatus.PENDING,
      transferProofStorageKey: null,
      appointment: { vet: { userId: VET_USER_ID } },
    });
    prisma.transaction.update.mockImplementation(async ({ data }) => ({
      id: TX_ID,
      ...data,
    }));

    const result = await service.submitTransferProof(
      VET_USER_ID,
      TX_ID,
      pdfFile,
      { transferCode: "TRF-001" },
    );

    expect(storage.upload).toHaveBeenCalledWith(
      pdfFile,
      `transfers/${TX_ID}`,
      { visibility: "private" },
    );
    expect(result.status).toBe(TransactionStatus.VERIFYING);
    expect(result.transferProofSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.transferProofStorageKey).toBe(
      "cloudinary:v1:private:raw:key",
    );
  });

  it("refuses transfer confirmation without durable evidence", async () => {
    prisma.transaction.findUnique.mockResolvedValue({
      id: TX_ID,
      appointmentId: APPT_ID,
      paymentMethod: PaymentMethod.TRANSFER,
      status: TransactionStatus.VERIFYING,
      transferProofStorageKey: null,
      transferCode: "TRF-001",
      appointment: {},
    });

    await expect(service.confirmTransfer("admin-1", TX_ID)).rejects.toThrow(
      ConflictException,
    );
  });

  it("atomically confirms the transfer and appointment", async () => {
    prisma.transaction.findUnique.mockResolvedValue({
      id: TX_ID,
      appointmentId: APPT_ID,
      paymentMethod: PaymentMethod.TRANSFER,
      status: TransactionStatus.VERIFYING,
      transferProofStorageKey: "private-key",
      transferCode: "TRF-001",
      appointment: {},
    });
    prisma.transaction.update.mockResolvedValue({
      id: TX_ID,
      status: TransactionStatus.CONFIRMED,
    });

    await service.confirmTransfer("admin-1", TX_ID);

    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TransactionStatus.CONFIRMED,
          transferReviewedById: "admin-1",
        }),
      }),
    );
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: APPT_ID },
      data: { status: AppointmentStatus.CONFIRMED },
    });
  });

  it("creates an auditable settlement batch before liquidating", async () => {
    prisma.transaction.findMany.mockResolvedValue([
      { id: "tx-a", amountCop: 100_000, commissionAmount: 10_000 },
      { id: "tx-b", amountCop: 50_000, commissionAmount: 5_000 },
    ]);
    prisma.financialSettlementBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.transaction.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.runSettlementBatch("admin-1", 7);

    expect(prisma.financialSettlementBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        transactionCount: 2,
        totalGrossCop: 150_000,
        totalCommissionCop: 15_000,
        totalNetCop: 135_000,
        createdById: "admin-1",
      }),
    });
    expect(result.liquidatedCount).toBe(2);
  });

  it("rolls back a settlement when the selected set changes", async () => {
    prisma.transaction.findMany.mockResolvedValue([
      { id: "tx-a", amountCop: 100_000, commissionAmount: 10_000 },
      { id: "tx-b", amountCop: 50_000, commissionAmount: 5_000 },
    ]);
    prisma.financialSettlementBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.runSettlementBatch("admin-1", 7)).rejects.toThrow(
      ConflictException,
    );
  });

  it("reserves available liquidated earnings when a withdrawal is requested", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: VET_USER_ID,
      vetProfile: { id: VET_ID },
    });
    prisma.transaction.aggregate.mockResolvedValue({
      _sum: { amountCop: 200_000, commissionAmount: 20_000 },
    });
    prisma.vetWithdrawal.aggregate
      .mockResolvedValueOnce({ _sum: { amountCop: 50_000 } })
      .mockResolvedValueOnce({ _sum: { amountCop: 20_000 } });
    prisma.vetWithdrawal.create.mockImplementation(async ({ data }) => ({
      id: "withdrawal-1",
      requestedAt: new Date(),
      ...data,
    }));

    const result = await service.requestWithdrawal(VET_USER_ID, {
      amountCop: 100_000,
      paymentMethod: "BANK_TRANSFER",
      accountInfo: {
        bankName: "Bancolombia",
        accountNumber: "1234567890",
        accountType: "SAVINGS",
        documentId: "123456789",
      },
    });

    expect(prisma.vetWithdrawal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amountCop: 100_000,
        destinationCiphertext: "v1.encrypted",
        destinationMasked: expect.stringContaining("••••7890"),
      }),
    });
    expect(result.balance.availableCop).toBe(30_000);
    expect((result.withdrawal as any).destinationCiphertext).toBeUndefined();
  });

  it("prevents a withdrawal from exceeding unreserved earnings", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: VET_USER_ID,
      vetProfile: { id: VET_ID },
    });
    prisma.transaction.aggregate.mockResolvedValue({
      _sum: { amountCop: 100_000, commissionAmount: 10_000 },
    });
    prisma.vetWithdrawal.aggregate
      .mockResolvedValueOnce({ _sum: { amountCop: 60_000 } })
      .mockResolvedValueOnce({ _sum: { amountCop: 0 } });

    await expect(
      service.requestWithdrawal(VET_USER_ID, {
        amountCop: 50_000,
        paymentMethod: "NEQUI",
        accountInfo: {
          phoneNumber: "3001234567",
          documentId: "123456789",
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("requires APPROVED before a withdrawal can enter PROCESSING", async () => {
    prisma.vetWithdrawal.findUnique.mockResolvedValue({
      id: "withdrawal-1",
      status: "PENDING",
    });

    await expect(
      service.markWithdrawalProcessing("admin-1", "withdrawal-1"),
    ).rejects.toThrow(BadRequestException);
  });
});
