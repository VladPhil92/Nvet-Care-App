import { ServiceUnavailableException } from "@nestjs/common";
import { PaymentMethod } from "@prisma/client";

import { PaymentsController } from "./payments.controller";

function createController() {
  const paymentsService = {
    processPayment: jest.fn(),
    initiatePse: jest.fn(),
  };
  const idempotencyService = {
    execute: jest.fn(),
  };

  return {
    controller: new PaymentsController(
      paymentsService as never,
      idempotencyService as never,
    ),
    paymentsService,
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
});
