import { NotFoundException } from "@nestjs/common";
import { AppointmentStatus, TransactionStatus } from "@prisma/client";
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("materializes client appointment and preventive events before returning the inbox", async () => {
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

    const result = await service.listForUser("owner-1", "50");

    expect(vetProfileFindUnique).toHaveBeenCalledWith({
      where: { userId: "owner-1" },
      select: { id: true },
    });
    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: "owner-1" }),
      }),
    );
    expect(getPreventiveAgenda).toHaveBeenCalledWith("owner-1", 60);
    expect(notificationCreateMany).toHaveBeenCalledTimes(1);
    const createMany = notificationCreateMany.mock.calls[0][0];
    expect(createMany.skipDuplicates).toBe(true);
    expect(createMany.data.map((item: { type: string }) => item.type)).toEqual(
      expect.arrayContaining([
        "APPOINTMENT_CONFIRMED",
        "APPOINTMENT_REMINDER",
        "PREVENTIVE_OVERDUE",
      ]),
    );
    const preventive = createMany.data.find(
      (item: { type: string }) => item.type === "PREVENTIVE_OVERDUE",
    );
    expect(preventive.occurredAt).toEqual(
      new Date("2026-08-31T12:00:00.000Z"),
    );
    expect(result.summary).toEqual({ total: 3, unread: 3 });
  });

  it("materializes payment lifecycle events for clients", async () => {
    appointmentFindMany.mockResolvedValue([
      {
        id: "appointment-payment",
        status: AppointmentStatus.CONFIRMED,
        date: new Date("2026-09-10T00:00:00.000Z"),
        time: "15:00",
        createdAt: new Date("2026-08-30T12:00:00.000Z"),
        updatedAt: new Date("2026-08-31T10:00:00.000Z"),
        confirmedAt: new Date("2026-08-31T09:00:00.000Z"),
        inProgressAt: null,
        completedAt: null,
        pet: { id: "pet-2", name: "Bruno" },
        transaction: {
          id: "transaction-1",
          status: TransactionStatus.CONFIRMED,
          amountCop: 85000,
          paymentMethod: "PSE",
          verifiedAt: new Date("2026-08-31T10:00:00.000Z"),
          liquidatedAt: null,
          updatedAt: new Date("2026-08-31T10:00:00.000Z"),
        },
      },
    ]);
    notificationFindMany.mockResolvedValue([]);
    notificationCount.mockResolvedValue(0);

    await service.listForUser("owner-1");

    const data = notificationCreateMany.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "PAYMENT_CONFIRMED",
          category: "PAYMENT",
          dedupeKey: "transaction:transaction-1:CLIENT:CONFIRMED",
          userId: "owner-1",
        }),
      ]),
    );
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
    notificationFindMany.mockResolvedValue([]);
    notificationCount.mockResolvedValue(0);

    await service.listForUser("vet-user-1");

    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ vetId: "vet-profile-1" }),
      }),
    );
    expect(getPreventiveAgenda).not.toHaveBeenCalled();
    const data = notificationCreateMany.mock.calls[0][0].data;
    expect(data.map((item: { type: string }) => item.type)).toEqual(
      expect.arrayContaining([
        "VET_APPOINTMENT_REQUESTED",
        "VET_PAYMENT_CONFIRMED",
      ]),
    );
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "vet-user-1",
          dedupeKey: "appointment:appointment-vet:VET:PENDING",
          actionPath: "/nvetcareapp/dashboard/veterinario",
        }),
      ]),
    );
  });

  it("bounds appointment synchronization to active or recently changed records", async () => {
    notificationCount.mockResolvedValue(0);

    await service.getUnreadCount("owner-1");

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
    expect(notificationCreateMany).not.toHaveBeenCalled();
  });

  it("never marks a notification owned by another user", async () => {
    notificationFindFirst.mockResolvedValue(null);

    await expect(
      service.markRead("owner-1", "11111111-1111-4111-8111-111111111111"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(notificationUpdate).not.toHaveBeenCalled();
  });

  it("marks every unread notification only inside the authenticated user scope", async () => {
    notificationUpdateMany.mockResolvedValue({ count: 4 });

    const result = await service.markAllRead("owner-1");

    expect(notificationUpdateMany).toHaveBeenCalledWith({
      where: { userId: "owner-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(result.updated).toBe(4);
  });
});
