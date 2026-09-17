import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  PaymentMethod,
  TransactionStatus,
} from "@prisma/client";
import { createHash } from "crypto";
import { ManualTransferPaymentService } from "./manual-transfer-payment.service";

const TX_ID = "00000000-0000-4000-8000-000000000001";
const APPT_ID = "00000000-0000-4000-8000-000000000002";
const VET_USER_ID = "00000000-0000-4000-8000-000000000003";
const CLIENT_USER_ID = "00000000-0000-4000-8000-000000000004";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000005";
const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000006";
const PET_ID = "00000000-0000-4000-8000-000000000007";

const STORAGE_KEY = "cloudinary:v1:private:raw:transfers/key";

function proofFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    originalname: "comprobante.png",
    mimetype: "image/png",
    size: 11,
    buffer: Buffer.from("fake-png-01"),
    ...overrides,
  } as Express.Multer.File;
}

function transferTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: TX_ID,
    appointmentId: APPT_ID,
    amountCop: 120_000,
    paymentMethod: PaymentMethod.TRANSFER,
    status: TransactionStatus.PENDING,
    transferProofStorageKey: null,
    appointment: {
      id: APPT_ID,
      clientId: CLIENT_USER_ID,
      petId: PET_ID,
      serviceType: "CONSULTA_GENERAL",
      date: "2026-09-20",
      time: "10:00",
      address: "Calle 1 #2-3",
      notes: null,
      client: { id: CLIENT_USER_ID, firstName: "Ana", lastName: "Ruiz" },
      pet: { id: PET_ID, name: "Rocky" },
      vet: { userId: VET_USER_ID, user: { id: VET_USER_ID } },
    },
    ...overrides,
  };
}

describe("ManualTransferPaymentService", () => {
  let prisma: any;
  let storage: any;
  let service: ManualTransferPaymentService;

  beforeEach(() => {
    prisma = {
      transaction: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      appointment: { update: jest.fn() },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: ADMIN_USER_ID }]) },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(prisma)),
    };
    storage = {
      upload: jest.fn().mockResolvedValue({ storageKey: STORAGE_KEY }),
      read: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new ManualTransferPaymentService(prisma, storage);
  });

  // =========================================================================
  // submitClientProof — the client reports a transfer they already paid
  // =========================================================================
  describe("submitClientProof", () => {
    const dto = { transferCode: "  TRX-9091  " } as any;

    it("refuses a submission with no usable file before touching storage", async () => {
      await expect(
        service.submitClientProof(
          CLIENT_USER_ID,
          TX_ID,
          proofFile({ buffer: Buffer.alloc(0) }),
          dto,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.transaction.findUnique).not.toHaveBeenCalled();
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it("refuses a submission from anyone other than the paying client", async () => {
      prisma.transaction.findUnique.mockResolvedValue(transferTransaction());

      await expect(
        service.submitClientProof(OTHER_USER_ID, TX_ID, proofFile(), dto),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(storage.upload).not.toHaveBeenCalled();
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    });

    it("refuses a transaction that is not a transfer", async () => {
      prisma.transaction.findUnique.mockResolvedValue(
        transferTransaction({ paymentMethod: PaymentMethod.PSE }),
      );

      await expect(
        service.submitClientProof(CLIENT_USER_ID, TX_ID, proofFile(), dto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it("refuses a second submission once the transfer left PENDING", async () => {
      prisma.transaction.findUnique.mockResolvedValue(
        transferTransaction({ status: TransactionStatus.VERIFYING }),
      );

      await expect(
        service.submitClientProof(CLIENT_USER_ID, TX_ID, proofFile(), dto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it("reports a missing transaction rather than uploading an orphan proof", async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);

      await expect(
        service.submitClientProof(CLIENT_USER_ID, TX_ID, proofFile(), dto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it("stores the proof privately and claims PENDING atomically", async () => {
      const file = proofFile();
      prisma.transaction.findUnique
        .mockResolvedValueOnce(transferTransaction())
        .mockResolvedValueOnce({
          id: TX_ID,
          status: TransactionStatus.VERIFYING,
        });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.submitClientProof(
        CLIENT_USER_ID,
        TX_ID,
        file,
        dto,
      );

      expect(storage.upload).toHaveBeenCalledWith(
        file,
        `transfers/${TX_ID}`,
        { visibility: "private" },
      );

      const [claim] = prisma.transaction.updateMany.mock.calls[0];
      // The status guard in the WHERE clause is what makes the transition safe
      // under two concurrent submissions.
      expect(claim.where).toEqual({
        id: TX_ID,
        status: TransactionStatus.PENDING,
      });
      expect(claim.data.status).toBe(TransactionStatus.VERIFYING);
      expect(claim.data.transferProofStorageKey).toBe(STORAGE_KEY);
      expect(claim.data.transferCode).toBe("TRX-9091");
      expect(result).toEqual({ id: TX_ID, status: TransactionStatus.VERIFYING });
    });

    it("records the exact sha256 of the uploaded bytes as tamper evidence", async () => {
      const file = proofFile({ buffer: Buffer.from("receipt-bytes") });
      prisma.transaction.findUnique
        .mockResolvedValueOnce(transferTransaction())
        .mockResolvedValueOnce({ id: TX_ID });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });

      await service.submitClientProof(CLIENT_USER_ID, TX_ID, file, dto);

      const expected = createHash("sha256")
        .update(Buffer.from("receipt-bytes"))
        .digest("hex");
      expect(
        prisma.transaction.updateMany.mock.calls[0][0].data.transferProofSha256,
      ).toBe(expected);
    });

    it("neutralizes a hostile proof filename before persisting it", async () => {
      prisma.transaction.findUnique
        .mockResolvedValueOnce(transferTransaction())
        .mockResolvedValueOnce({ id: TX_ID });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });

      await service.submitClientProof(
        CLIENT_USER_ID,
        TX_ID,
        proofFile({ originalname: "../../etc/pa ss wd.png" }),
        dto,
      );

      const stored =
        prisma.transaction.updateMany.mock.calls[0][0].data
          .transferProofFileName;
      expect(stored).not.toMatch(/[/\\\s]/);
      expect(stored).toBe(".._.._etc_pa_ss_wd.png");
    });

    it("clears any previous rejection so a resubmission starts clean", async () => {
      prisma.transaction.findUnique
        .mockResolvedValueOnce(transferTransaction())
        .mockResolvedValueOnce({ id: TX_ID });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });

      await service.submitClientProof(CLIENT_USER_ID, TX_ID, proofFile(), dto);

      const { data } = prisma.transaction.updateMany.mock.calls[0][0];
      expect(data.transferReviewedById).toBeNull();
      expect(data.transferRejectedAt).toBeNull();
      expect(data.transferRejectionReason).toBeNull();
    });

    it("deletes the uploaded proof when a concurrent write wins the claim", async () => {
      prisma.transaction.findUnique.mockResolvedValue(transferTransaction());
      prisma.transaction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.submitClientProof(CLIENT_USER_ID, TX_ID, proofFile(), dto),
      ).rejects.toBeInstanceOf(ConflictException);

      // Losing the race must not leave a private orphan in storage.
      expect(storage.delete).toHaveBeenCalledWith(STORAGE_KEY);
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it("notifies every active admin under one dedupe key", async () => {
      prisma.transaction.findUnique
        .mockResolvedValueOnce(transferTransaction())
        .mockResolvedValueOnce({ id: TX_ID });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findMany.mockResolvedValue([
        { id: ADMIN_USER_ID },
        { id: OTHER_USER_ID },
      ]);

      await service.submitClientProof(CLIENT_USER_ID, TX_ID, proofFile(), dto);

      const [payload] = prisma.notification.createMany.mock.calls[0];
      expect(payload.skipDuplicates).toBe(true);
      expect(payload.data).toHaveLength(2);
      for (const row of payload.data) {
        expect(row.dedupeKey).toBe(`manual-transfer:${TX_ID}:submitted`);
        expect(row.type).toBe("TRANSFER_PROOF_SUBMITTED");
      }
    });

    it("still completes when no admin account is active", async () => {
      prisma.transaction.findUnique
        .mockResolvedValueOnce(transferTransaction())
        .mockResolvedValueOnce({ id: TX_ID });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findMany.mockResolvedValue([]);

      await expect(
        service.submitClientProof(CLIENT_USER_ID, TX_ID, proofFile(), dto),
      ).resolves.toEqual({ id: TX_ID });
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // approve — an admin confirms the money actually arrived
  // =========================================================================
  describe("approve", () => {
    it("refuses to approve a transfer that is not under review", async () => {
      prisma.transaction.findUnique.mockResolvedValue(
        transferTransaction({ status: TransactionStatus.CONFIRMED }),
      );

      await expect(service.approve(ADMIN_USER_ID, TX_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses to approve when no proof was ever stored", async () => {
      prisma.transaction.findUnique.mockResolvedValue(
        transferTransaction({
          status: TransactionStatus.VERIFYING,
          transferProofStorageKey: null,
        }),
      );

      await expect(service.approve(ADMIN_USER_ID, TX_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("confirms the transaction and the appointment together", async () => {
      prisma.transaction.findUnique
        .mockResolvedValueOnce(
          transferTransaction({
            status: TransactionStatus.VERIFYING,
            transferProofStorageKey: STORAGE_KEY,
          }),
        )
        .mockResolvedValueOnce({
          id: TX_ID,
          status: TransactionStatus.CONFIRMED,
        });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.approve(ADMIN_USER_ID, TX_ID);

      const [claim] = prisma.transaction.updateMany.mock.calls[0];
      expect(claim.where).toEqual({
        id: TX_ID,
        status: TransactionStatus.VERIFYING,
      });
      expect(claim.data.status).toBe(TransactionStatus.CONFIRMED);
      expect(claim.data.transferReviewedById).toBe(ADMIN_USER_ID);

      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: APPT_ID },
          data: expect.objectContaining({
            status: AppointmentStatus.CONFIRMED,
          }),
        }),
      );
      expect(result).toEqual({
        id: TX_ID,
        status: TransactionStatus.CONFIRMED,
      });
    });

    it("rejects a second admin decision on the same transfer", async () => {
      prisma.transaction.findUnique.mockResolvedValue(
        transferTransaction({
          status: TransactionStatus.VERIFYING,
          transferProofStorageKey: STORAGE_KEY,
        }),
      );
      // A competing admin already moved it out of VERIFYING.
      prisma.transaction.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve(ADMIN_USER_ID, TX_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it("notifies both the client and the veterinarian", async () => {
      prisma.transaction.findUnique
        .mockResolvedValueOnce(
          transferTransaction({
            status: TransactionStatus.VERIFYING,
            transferProofStorageKey: STORAGE_KEY,
          }),
        )
        .mockResolvedValueOnce({ id: TX_ID });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });

      await service.approve(ADMIN_USER_ID, TX_ID);

      const notified = prisma.notification.upsert.mock.calls.map(
        ([call]: any[]) => call.create.userId,
      );
      expect(notified).toEqual([CLIENT_USER_ID, VET_USER_ID]);
    });
  });

  // =========================================================================
  // reject — an admin could not match the transfer
  // =========================================================================
  describe("reject", () => {
    const validReason = "El comprobante no coincide con el monto recibido";

    it.each([
      ["an empty reason", "   "],
      ["a reason under 10 characters", "muy corto"],
      ["a reason over 500 characters", "x".repeat(501)],
    ])("refuses %s", async (_label, reason) => {
      await expect(
        service.reject(ADMIN_USER_ID, TX_ID, reason),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.transaction.findUnique).not.toHaveBeenCalled();
    });

    it("refuses to reject a transfer that is not under review", async () => {
      prisma.transaction.findUnique.mockResolvedValue(
        transferTransaction({ status: TransactionStatus.CONFIRMED }),
      );

      await expect(
        service.reject(ADMIN_USER_ID, TX_ID, validReason),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("fails the transaction and records the trimmed reason", async () => {
      prisma.transaction.findUnique
        .mockResolvedValueOnce(
          transferTransaction({ status: TransactionStatus.VERIFYING }),
        )
        .mockResolvedValueOnce({ id: TX_ID, status: TransactionStatus.FAILED });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.reject(
        ADMIN_USER_ID,
        TX_ID,
        `  ${validReason}  `,
      );

      const [claim] = prisma.transaction.updateMany.mock.calls[0];
      expect(claim.where).toEqual({
        id: TX_ID,
        status: TransactionStatus.VERIFYING,
      });
      expect(claim.data.status).toBe(TransactionStatus.FAILED);
      expect(claim.data.transferRejectionReason).toBe(validReason);
      expect(claim.data.transferReviewedById).toBe(ADMIN_USER_ID);
      expect(result).toEqual({ id: TX_ID, status: TransactionStatus.FAILED });
    });

    it("rejects a second admin decision on the same transfer", async () => {
      prisma.transaction.findUnique.mockResolvedValue(
        transferTransaction({ status: TransactionStatus.VERIFYING }),
      );
      prisma.transaction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reject(ADMIN_USER_ID, TX_ID, validReason),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.notification.upsert).not.toHaveBeenCalled();
    });

    it("tells the client how to reach customer service", async () => {
      prisma.transaction.findUnique
        .mockResolvedValueOnce(
          transferTransaction({ status: TransactionStatus.VERIFYING }),
        )
        .mockResolvedValueOnce({ id: TX_ID });
      prisma.transaction.updateMany.mockResolvedValue({ count: 1 });

      await service.reject(ADMIN_USER_ID, TX_ID, validReason);

      const [call] = prisma.notification.upsert.mock.calls[0];
      expect(call.create.userId).toBe(CLIENT_USER_ID);
      expect(call.create.type).toBe("TRANSFER_REJECTED");
      expect(call.create.message).toContain(validReason);
      expect(call.create.metadata.customerServiceWhatsapp).toBeTruthy();
      expect(call.create.message).toContain(
        call.create.metadata.customerServiceWhatsapp,
      );
    });
  });

  // =========================================================================
  // getProof — admin reads the private evidence
  // =========================================================================
  describe("getProof", () => {
    it("reports a missing transaction", async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);
      await expect(service.getProof(TX_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("refuses a non-transfer transaction", async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        paymentMethod: PaymentMethod.PSE,
        transferProofStorageKey: STORAGE_KEY,
      });
      await expect(service.getProof(TX_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(storage.read).not.toHaveBeenCalled();
    });

    it("reports a transfer that has no proof yet", async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        paymentMethod: PaymentMethod.TRANSFER,
        transferProofStorageKey: null,
      });
      await expect(service.getProof(TX_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storage.read).not.toHaveBeenCalled();
    });

    it("returns the stored bytes with a sanitized filename", async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        paymentMethod: PaymentMethod.TRANSFER,
        transferProofStorageKey: STORAGE_KEY,
        transferProofFileName: "../secret report.png",
        transferProofMimeType: "image/png",
      });
      storage.read.mockResolvedValue(Buffer.from("bytes"));

      const proof = await service.getProof(TX_ID);

      expect(storage.read).toHaveBeenCalledWith(STORAGE_KEY);
      expect(proof.mimeType).toBe("image/png");
      expect(proof.fileName).not.toMatch(/[/\\\s]/);
    });

    it("falls back to a generic mime type when none was recorded", async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        paymentMethod: PaymentMethod.TRANSFER,
        transferProofStorageKey: STORAGE_KEY,
        transferProofFileName: null,
        transferProofMimeType: null,
      });
      storage.read.mockResolvedValue(Buffer.from("bytes"));

      const proof = await service.getProof(TX_ID);

      expect(proof.mimeType).toBe("application/octet-stream");
      expect(proof.fileName).toBe("comprobante");
    });
  });
});
