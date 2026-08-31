import { NotFoundException } from "@nestjs/common";
import { AppointmentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PetsService } from "../pets/pets.service";
import { NotificationsService } from "./notifications.service";

describe("NotificationsService", () => {
  const appointmentFindMany = jest.fn();
  const notificationCreateMany = jest.fn();
  const notificationFindMany = jest.fn();
  const notificationCount = jest.fn();
  const notificationFindFirst = jest.fn();
  const notificationUpdate = jest.fn();
  const notificationUpdateMany = jest.fn();
  const prisma = {
    appointment: { findMany: appointmentFindMany },
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

  it("materializes appointment and preventive events before returning the inbox", async () => {
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
