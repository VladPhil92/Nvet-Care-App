import { AppointmentStatus } from "@prisma/client";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PetsService } from "../pets/pets.service";
import { NotificationsService } from "./notifications.service";

describe("NotificationsService", () => {
  const appointmentFindMany = jest.fn();
  const notificationUpsert = jest.fn();
  const notificationFindMany = jest.fn();
  const notificationCount = jest.fn();
  const notificationFindFirst = jest.fn();
  const notificationUpdate = jest.fn();
  const notificationUpdateMany = jest.fn();
  const prisma = {
    appointment: { findMany: appointmentFindMany },
    notification: {
      upsert: notificationUpsert,
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
    notificationUpsert.mockResolvedValue({});
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
      expect.objectContaining({ where: { clientId: "owner-1" } }),
    );
    expect(getPreventiveAgenda).toHaveBeenCalledWith("owner-1", 60);
    expect(notificationUpsert).toHaveBeenCalledTimes(3);
    expect(
      notificationUpsert.mock.calls.map((call) => call[0].create.type),
    ).toEqual(
      expect.arrayContaining([
        "APPOINTMENT_CONFIRMED",
        "APPOINTMENT_REMINDER",
        "PREVENTIVE_OVERDUE",
      ]),
    );
    expect(result.summary).toEqual({ total: 3, unread: 3 });
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
