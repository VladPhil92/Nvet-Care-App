import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PaymentMethod } from "@prisma/client";

import { PaymentsController } from "./payments.controller";

function createController() {
  const paymentsService = {
    processPayment: jest.fn(),
    initiatePse: jest.fn(),
    getBalance: jest.fn(),
  };
  const financialOperations = {
    requestWithdrawal: jest.fn(),
    getBalanceForUser: jest.fn(),
  };
  const idempotencyService = {
    execute: jest.fn(),
  };

  return {
    controller: new PaymentsController(
      paymentsService as never,
      financialOperations as never,
      idempotencyService as never,
    ),
    paymentsService,
    financialOperations,
    idempotencyService,
  };
}

describe("PaymentsController production rail guards", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    jest.clearAllMocks();
  });

  it("refuses direct PSE initiation in production before calling the sandbox service", async () => {
    process.env.NODE_ENV = "production";
    const { controller, paymentsService, idempotencyService } = createController();

    await expect(
      controller.initiatePse(
        { user: { id: "client-1" } },
        {
          appointmentId: "00000000-0000-4000-8000-000000000201",
          amountCop: 50_000,
          bank: "001",
          userType: "NATURAL",
        },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(paymentsService.initiatePse).not.toHaveBeenCalled();
    expect(idempotencyService.execute).not.toHaveBeenCalled();
  });

  it("refuses PSE through the generic payment endpoint in production", async () => {
    process.env.NODE_ENV = "production";
    const { controller, paymentsService, idempotencyService } = createController();

    await expect(
      controller.processPayment(
        { user: { id: "client-1" } },
        {
          appointmentId: "00000000-0000-4000-8000-000000000201",
          paymentMethod: PaymentMethod.PSE,
          amountCop: 50_000,
        },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(paymentsService.processPayment).not.toHaveBeenCalled();
    expect(idempotencyService.execute).not.toHaveBeenCalled();
  });

  it("keeps sandbox PSE delegation available outside production for E2E certification", async () => {
    process.env.NODE_ENV = "test";
    const { controller, paymentsService } = createController();
    paymentsService.initiatePse.mockResolvedValue({
      transactionId: "tx-test",
      paymentUrl: "https://sandbox.invalid/pay/tx-test",
      bankName: "Sandbox Bank",
    });

    const result = await controller.initiatePse(
      { user: { id: "client-1" } },
      {
        appointmentId: "00000000-0000-4000-8000-000000000201",
        amountCop: 50_000,
        bank: "001",
        userType: "NATURAL",
      },
    );

    expect(paymentsService.initiatePse).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ transactionId: "tx-test" });
  });

  it("requires a persistent idempotency key for withdrawal requests", async () => {
    process.env.NODE_ENV = "test";
    const { controller, financialOperations, idempotencyService } =
      createController();

    await expect(
      controller.requestWithdrawal(
        { user: { id: "vet-1" } },
        {
          amountCop: 50_000,
          paymentMethod: "NEQUI",
          accountInfo: {
            phoneNumber: "3001234567",
            documentId: "123456789",
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(financialOperations.requestWithdrawal).not.toHaveBeenCalled();
    expect(idempotencyService.execute).not.toHaveBeenCalled();
  });

  it("routes a withdrawal through persistent idempotency", async () => {
    process.env.NODE_ENV = "test";
    const { controller, financialOperations, idempotencyService } =
      createController();
    financialOperations.requestWithdrawal.mockResolvedValue({
      withdrawal: { id: "withdrawal-1", status: "PENDING" },
    });
    idempotencyService.execute.mockImplementation(async ({ operation }) => {
      const result = await operation();
      return { result: result.body };
    });

    const result = await controller.requestWithdrawal(
      { user: { id: "vet-1" } },
      {
        amountCop: 50_000,
        paymentMethod: "NEQUI",
        accountInfo: {
          phoneNumber: "3001234567",
          documentId: "123456789",
        },
      },
      "withdraw-12345678",
    );

    expect(idempotencyService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "payments:withdrawal:vet-1:withdraw-12345678",
      }),
    );
    expect(result).toMatchObject({
      withdrawal: { id: "withdrawal-1", status: "PENDING" },
    });
  });
});
