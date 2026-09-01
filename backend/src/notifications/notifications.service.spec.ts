import { ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  AppointmentStatus,
  TransactionStatus,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PetsService } from "../pets/pets.service";
import { NotificationsService } from "./notifications.service";

describe("NotificationsService", () => {
  const appointmentFindMany = jest.fn();
  const vetProfileFindUnique = jest.fn();
  const notificationCreateMany = jest.fn();
  const notificationFindMany = jest.fn();
  const notificationCount = jest.fn();
  const notificationFindFirst = jest.fn();
  const notificationUpdate = jest.fn();
  const notificationUpdateMany = jest.fn();
  const prisma = {
    appointment: { findMany: appointmentFindMany },
    vetProfile: { findUnique: vetProfileFindUnique },
    notification: {
      createMany: notificationCreateMany,
      findMany: notificationFindMany,
      count: notificationCount,
      findFirst: notificationFindFirst,
      update: notificationUpdate,
      updateMany: notificationUpdateMany,
    },
  } as unknown as PrismaService;
  const getPreventiveAgenda = jest.fn();
  const petsService = { getPreventiveAgenda } as unknown as PetsService;
  const service = new NotificationsService(prisma, petsService);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    appointmentFindMany.mockResolvedValue([]);
    vetProfileFindUnique.mockResolvedValue(null);
    getPreventiveAgenda.mockResolvedValue({
      generatedAt: "2026-08-31T12:00:00.000Z",
      windowDays: 60,
      summary: { total: 0, overdue: 0, dueSoon: 0, upcoming: 0 },
      items: [],
    });
    notificationCreateMany.mockResolvedValue({ count: 0 });
    notificationFindMany.mockResolvedValue([]);
    notificationCount.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("materializes the CLIENT inbox from the effective request role without consulting a vet profile", async () => {
    appointmentFindMany.mockResolvedValue([
      {
        id: "appointment-1",
        status: AppointmentStatus.CONFIRMED,
        date: new Date("2026-09-01T00:00:00.000Z"),
        time: "10:00",
        createdAt: new Date("2026-08-20T12:00:00.000Z"),
        updatedAt: new Date("2026-08-30T12:00:00.000Z"),
        confirmedAt: new Date("2026-08-30T12:00:00.000Z"),
        inProgressAt: null,
        completedAt: null,
        pet: { id: "pet-1", name: "Luna" },
        transaction: null,
      },
    ]);
    getPreventiveAgenda.mockResolvedValue({
      generatedAt: "2026-08-31T12:00:00.000Z",
      windowDays: 60,
      summary: { total: 1, overdue: 1, dueSoon: 0, upcoming: 0 },
      items: [
        {
          id: "preventive-1",
          petId: "pet-1",
          petName: "Luna",
          species: "DOG",
          source: "VACCINATION",
          kind: "VACCINATION",
          title: "Próxima vacuna: Rabia",
          dueAt: "2026-08-30",
          status: "OVERDUE",
          daysUntilDue: -1,
        },
      ],
    });
    notificationFindMany.mockResolvedValue([{ id: "notification-1" }]);
    notificationCount.mockResolvedValueOnce(3).mockResolvedValueOnce(3);

    const result = await service.listForUser(
      "owner-1",
      UserRole.CLIENT,
      "50",
    );

    expect(vetProfileFindUnique).not.toHaveBeenCalled();
    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: "owner-1" }),
      }),
    );
    expect(getPreventiveAgenda).toHaveBeenCalledWith("owner-1", 60);
    expect(notificationCreateMany).toHaveBeenCalledTimes(1);
    const createMany = notificationCreateMany.mock.calls[0][0];
    expect(createMany.skipDuplicates).toBe(true);
    expect(createMany.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "APPOINTMENT_CONFIRMED",
          dedupeKey: "appointment:appointment-1:CONFIRMED",
        }),
        expect.objectContaining({
          type: "APPOINTMENT_REMINDER",
          dedupeKey: "appointment:appointment-1:REMINDER:2026-09-01",
        }),
        expect.objectContaining({ type: "PREVENTIVE_OVERDUE" }),
      ]),
    );
    expect(notificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "owner-1",
          NOT: { dedupeKey: { contains: ":VET:" } },
        },
      }),
    );
    expect(result.summary).toEqual({ total: 3, unread: 3 });
  });

  it("materializes an isolated operational inbox for a real veterinarian", async () => {
    vetProfileFindUnique.mockResolvedValue({ id: "vet-profile-1" });
    appointmentFindMany.mockResolvedValue([
      {
        id: "appointment-vet",
        status: AppointmentStatus.PENDING,
        date: new Date("2026-09-02T00:00:00.000Z"),
        time: "09:30",
        createdAt: new Date("2026-08-31T11:00:00.000Z"),
        updatedAt: new Date("2026-08-31T11:00:00.000Z"),
        confirmedAt: null,
        inProgressAt: null,
        completedAt: null,
        pet: { id: "pet-vet", name: "Mía" },
        client: {
          id: "client-1",
          firstName: "Laura",
          lastName: "Martínez",
        },
        transaction: {
          id: "transaction-vet",
          status: TransactionStatus.CONFIRMED,
          amountCop: 120000,
          paymentMethod: "CTG",
          verifiedAt: new Date("2026-08-31T11:05:00.000Z"),
          liquidatedAt: null,
          updatedAt: new Date("2026-08-31T11:05:00.000Z"),
        },
      },
    ]);

    await service.listForUser("vet-user-1", UserRole.VET);

    expect(vetProfileFindUnique).toHaveBeenCalledWith({
      where: { userId: "vet-user-1" },
      select: { id: true },
    });
    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ vetId: "vet-profile-1" }),
      }),
    );
    expect(getPreventiveAgenda).not.toHaveBeenCalled();
    const data = notificationCreateMany.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "VET_APPOINTMENT_REQUESTED",
          dedupeKey: "appointment:appointment-vet:VET:PENDING",
        }),
        expect.objectContaining({
          type: "VET_PAYMENT_CONFIRMED",
          dedupeKey: "transaction:transaction-vet:VET:CONFIRMED",
        }),
      ]),
    );
    expect(notificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "vet-user-1",
          dedupeKey: { contains: ":VET:" },
        },
      }),
    );
  });

  it("reconstructs confirmed and liquidated payment events even when no inbox poll occurred between transitions", async () => {
    appointmentFindMany.mockResolvedValue([
      {
        id: "appointment-payment",
        status: AppointmentStatus.COMPLETED,
        date: new Date("2026-08-30T00:00:00.000Z"),
        time: "15:00",
        createdAt: new Date("2026-08-28T12:00:00.000Z"),
        updatedAt: new Date("2026-08-31T11:00:00.000Z"),
        confirmedAt: new Date("2026-08-29T09:00:00.000Z"),
        inProgressAt: new Date("2026-08-30T14:00:00.000Z"),
        completedAt: new Date("2026-08-30T16:00:00.000Z"),
        pet: { id: "pet-2", name: "Bruno" },
        transaction: {
          id: "transaction-1",
          status: TransactionStatus.LIQUIDATED,
          amountCop: 85000,
          paymentMethod: "PSE",
          verifiedAt: new Date("2026-08-30T16:10:00.000Z"),
          liquidatedAt: new Date("2026-08-31T10:00:00.000Z"),
          updatedAt: new Date("2026-08-31T10:00:00.000Z"),
        },
      },
    ]);

    await service.listForUser("owner-1", UserRole.CLIENT);

    const data = notificationCreateMany.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "PAYMENT_CONFIRMED",
          dedupeKey: "transaction:transaction-1:CLIENT:CONFIRMED",
          occurredAt: new Date("2026-08-30T16:10:00.000Z"),
        }),
        expect.objectContaining({
          type: "PAYMENT_LIQUIDATED",
          dedupeKey: "transaction:transaction-1:CLIENT:LIQUIDATED",
          occurredAt: new Date("2026-08-31T10:00:00.000Z"),
        }),
      ]),
    );
  });

  it("bounds client appointment synchronization to active or recently changed records", async () => {
    await service.getUnreadCount("owner-1", UserRole.CLIENT);

    const query = appointmentFindMany.mock.calls[0][0];
    expect(query.where.clientId).toBe("owner-1");
    expect(query.where.OR).toEqual(
      expect.arrayContaining([
        {
          status: {
            in: expect.arrayContaining([
              AppointmentStatus.PENDING,
              AppointmentStatus.CONFIRMED,
              AppointmentStatus.IN_PROGRESS,
              AppointmentStatus.DISPUTED,
            ]),
          },
        },
        { updatedAt: { gte: new Date("2026-06-02T12:00:00.000Z") } },
      ]),
    );
  });

  it("never reads or marks a VET notification while operating in CLIENT mode", async () => {
    notificationFindFirst.mockResolvedValue(null);

    await expect(
      service.markRead(
        "owner-1",
        UserRole.CLIENT,
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(notificationFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "owner-1",
        NOT: { dedupeKey: { contains: ":VET:" } },
        id: "11111111-1111-4111-8111-111111111111",
      },
    });
    expect(notificationUpdate).not.toHaveBeenCalled();
  });

  it("marks all unread notifications only inside the effective audience", async () => {
    notificationUpdateMany.mockResolvedValue({ count: 4 });

    const result = await service.markAllRead("vet-user-1", UserRole.VET);

    expect(notificationUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "vet-user-1",
        dedupeKey: { contains: ":VET:" },
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
    expect(result.updated).toBe(4);
  });

  it("rejects administrative authority that has not selected a supported inbox role", async () => {
    await expect(
      service.listForUser("admin-1", UserRole.SUPERADMIN),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(appointmentFindMany).not.toHaveBeenCalled();
    expect(notificationFindMany).not.toHaveBeenCalled();
  });
});
