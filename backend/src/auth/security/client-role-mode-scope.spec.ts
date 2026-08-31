import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PaymentsService } from "../../payments/payments.service";
import { ChatService } from "../../chat/chat.service";

describe("canonical root CLIENT-mode data scope", () => {
  it("scopes transaction lists to the root's own clientId even when the persisted role is ADMIN", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "root-user",
          role: UserRole.ADMIN,
          vetProfile: { id: "root-vet" },
        }),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as any;
    const service = new PaymentsService(prisma, {} as any);

    await service.getTransactions("root-user", {}, UserRole.CLIENT);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { appointment: { clientId: "root-user" } },
      }),
    );
    expect(prisma.transaction.count).toHaveBeenCalledWith({
      where: { appointment: { clientId: "root-user" } },
    });
  });

  it("does not let CLIENT mode read a transaction merely because the same identity is its veterinarian", async () => {
    const prisma = {
      user: { findUnique: jest.fn() },
      transaction: {
        findUnique: jest.fn().mockResolvedValue({
          id: "tx-other-client",
          appointment: {
            clientId: "other-client",
            vet: { userId: "root-user" },
          },
        }),
      },
    } as any;
    const service = new PaymentsService(prisma, {} as any);

    await expect(
      service.getTransactionById(
        "root-user",
        "tx-other-client",
        UserRole.CLIENT,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("scopes active chats to client ownership instead of the persisted administrative role", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "root-user",
          role: UserRole.SUPERADMIN,
          vetProfile: { id: "root-vet" },
        }),
      },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      message: { count: jest.fn() },
    } as any;
    const service = new ChatService(prisma);

    await service.getActiveChats("root-user", UserRole.CLIENT);

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ["CONFIRMED", "IN_PROGRESS"] },
          clientId: "root-user",
        },
      }),
    );
  });
});
