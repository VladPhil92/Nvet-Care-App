import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ChatService } from "./chat.service";

describe("ChatService appointment lifecycle boundaries", () => {
  const prisma = {
    appointment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    message: {
      create: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const service = new ChatService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(["PENDING", "COMPLETED", "CANCELLED", "DISPUTED"])(
    "blocks new messages when appointment status is %s",
    async (status) => {
      prisma.appointment.findUnique.mockResolvedValue({ status });

      await expect(
        service.sendMessage("appointment-1", "client-1", "Hola"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    },
  );

  it.each(["CONFIRMED", "IN_PROGRESS"])(
    "allows new messages when appointment status is %s",
    async (status) => {
      prisma.appointment.findUnique.mockResolvedValue({ status });
      prisma.message.create.mockResolvedValue({ id: "message-1" });

      await service.sendMessage("appointment-1", "client-1", " Hola ");

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            appointmentId: "appointment-1",
            senderId: "client-1",
            content: "Hola",
          }),
        }),
      );
    },
  );

  it("constrains read acknowledgements to the authorized appointment", async () => {
    prisma.message.updateMany.mockResolvedValue({ count: 1 });

    await service.markAsRead(
      "appointment-1",
      ["message-1", "message-from-another-chat"],
      "client-1",
    );

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        appointmentId: "appointment-1",
        id: { in: ["message-1", "message-from-another-chat"] },
        senderId: { not: "client-1" },
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
  });

  it.each([UserRole.ADMIN, UserRole.SUPERADMIN])(
    "fails closed when active chats are requested in %s mode",
    async (role) => {
      prisma.user.findUnique.mockResolvedValue({
        id: "root-1",
        role,
        vetProfile: null,
      });

      await expect(service.getActiveChats("root-1", role)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    },
  );

  it("returns no active chats for VET mode without a vet profile", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      role: UserRole.VET,
      vetProfile: null,
    });

    await expect(
      service.getActiveChats("user-1", UserRole.VET),
    ).resolves.toEqual([]);
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });
});
