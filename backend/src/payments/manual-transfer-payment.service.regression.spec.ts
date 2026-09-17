import { PaymentMethod, TransactionStatus } from "@prisma/client";
import { ManualTransferPaymentService } from "./manual-transfer-payment.service";

const TX_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_USER_ID = "00000000-0000-4000-8000-000000000002";
const STORAGE_KEY = "cloudinary:v1:private:raw:transfers/key";

describe("ManualTransferPaymentService regression coverage", () => {
  it("deletes uploaded proof when the atomic persistence claim throws", async () => {
    const persistenceError = new Error("database unavailable");
    const prisma: any = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue({
          id: TX_ID,
          appointmentId: "00000000-0000-4000-8000-000000000003",
          amountCop: 120_000,
          paymentMethod: PaymentMethod.TRANSFER,
          status: TransactionStatus.PENDING,
          appointment: {
            clientId: CLIENT_USER_ID,
            serviceType: "CONSULTA_GENERAL",
            client: { firstName: "Ana" },
            pet: { name: "Rocky" },
            vet: { userId: "00000000-0000-4000-8000-000000000004" },
          },
        }),
        updateMany: jest.fn().mockRejectedValue(persistenceError),
      },
      user: { findMany: jest.fn() },
      notification: { createMany: jest.fn() },
    };
    const storage: any = {
      upload: jest.fn().mockResolvedValue({ storageKey: STORAGE_KEY }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ManualTransferPaymentService(prisma, storage);
    const file = {
      originalname: "comprobante.png",
      mimetype: "image/png",
      size: 5,
      buffer: Buffer.from("proof"),
    } as Express.Multer.File;

    await expect(
      service.submitClientProof(CLIENT_USER_ID, TX_ID, file, {
        transferCode: "TRX-1",
      } as any),
    ).rejects.toBe(persistenceError);

    expect(storage.delete).toHaveBeenCalledWith(STORAGE_KEY);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});
