import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MembershipStatus, VetTier } from "@prisma/client";
import { MembershipsService } from "./memberships.service";
import { VET_MEMBERSHIP_PLANS } from "./commercial-policy";

const VET_PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

function activeMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: "membership-1",
    vetProfileId: VET_PROFILE_ID,
    tier: VetTier.FREE,
    status: MembershipStatus.ACTIVE,
    monthlyPriceCop: VET_MEMBERSHIP_PLANS.FREE.monthlyPriceCop,
    commissionPct: VET_MEMBERSHIP_PLANS.FREE.commissionPct,
    requestedTier: null,
    requestedMonthlyPriceCop: null,
    requestedAt: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: null,
    ...overrides,
  };
}

describe("MembershipsService", () => {
  let prisma: any;
  let service: MembershipsService;

  beforeEach(() => {
    prisma = {
      vetProfile: { findUnique: jest.fn(), update: jest.fn() },
      vetMembership: {
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(prisma)),
    };
    service = new MembershipsService(prisma);
  });

  describe("getPlans", () => {
    it("exposes every configured tier plan", () => {
      const plans = service.getPlans();
      expect(plans).toHaveLength(Object.keys(VET_MEMBERSHIP_PLANS).length);
      expect(plans).toEqual(expect.arrayContaining(Object.values(VET_MEMBERSHIP_PLANS)));
    });
  });

  describe("getMyMembership", () => {
    it("refuses a user with no vet profile", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(null);
      await expect(service.getMyMembership(USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("backfills a membership row for a vet that predates the membership table", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({
        id: VET_PROFILE_ID,
        tier: VetTier.PRO,
        membership: null,
      });
      prisma.vetMembership.create.mockResolvedValue(
        activeMembership({ tier: VetTier.PRO }),
      );

      const result = await service.getMyMembership(USER_ID);

      expect(prisma.vetMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          vetProfileId: VET_PROFILE_ID,
          tier: VetTier.PRO,
          status: MembershipStatus.ACTIVE,
          monthlyPriceCop: VET_MEMBERSHIP_PLANS.PRO.monthlyPriceCop,
          commissionPct: VET_MEMBERSHIP_PLANS.PRO.commissionPct,
        }),
      });
      expect(result.tier).toBe(VetTier.PRO);
    });

    it("resolves a stale PENDING_CHANGE once the requested tier already matches the vet's actual tier", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({
        id: VET_PROFILE_ID,
        tier: VetTier.ELITE,
        membership: activeMembership({
          tier: VetTier.ELITE,
          status: MembershipStatus.PENDING_CHANGE,
          requestedTier: VetTier.ELITE,
        }),
      });
      prisma.vetMembership.upsert.mockResolvedValue(
        activeMembership({ tier: VetTier.ELITE }),
      );

      const result = await service.getMyMembership(USER_ID);

      expect(prisma.vetProfile.update).toHaveBeenCalledWith({
        where: { id: VET_PROFILE_ID },
        data: { tier: VetTier.ELITE },
      });
      expect(result.status).toBe(MembershipStatus.ACTIVE);
    });

    it("re-syncs the membership snapshot when VetProfile.tier is the source of truth and disagrees", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({
        id: VET_PROFILE_ID,
        tier: VetTier.PRO,
        membership: activeMembership({ tier: VetTier.FREE }),
      });
      prisma.vetMembership.upsert.mockResolvedValue(
        activeMembership({ tier: VetTier.PRO }),
      );

      const result = await service.getMyMembership(USER_ID);

      expect(prisma.vetMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vetProfileId: VET_PROFILE_ID },
        }),
      );
      expect(result.tier).toBe(VetTier.PRO);
    });

    it("returns the membership as-is when it already agrees with the vet profile", async () => {
      const membership = activeMembership({ tier: VetTier.PRO });
      prisma.vetProfile.findUnique.mockResolvedValue({
        id: VET_PROFILE_ID,
        tier: VetTier.PRO,
        membership,
      });

      await service.getMyMembership(USER_ID);

      expect(prisma.vetMembership.upsert).not.toHaveBeenCalled();
      expect(prisma.vetProfile.update).not.toHaveBeenCalled();
    });
  });

  describe("requestChange", () => {
    it("refuses a user with no vet profile", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.requestChange(USER_ID, VetTier.PRO),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("is a no-op when requesting the tier the vet is already on", async () => {
      const membership = activeMembership({ tier: VetTier.PRO });
      prisma.vetProfile.findUnique.mockResolvedValue({
        id: VET_PROFILE_ID,
        tier: VetTier.PRO,
        membership,
      });

      await service.requestChange(USER_ID, VetTier.PRO);

      expect(prisma.vetMembership.update).not.toHaveBeenCalled();
      expect(prisma.vetMembership.upsert).not.toHaveBeenCalled();
    });

    it("downgrades to FREE immediately, without a pending/payment step", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({
        id: VET_PROFILE_ID,
        tier: VetTier.PRO,
        membership: activeMembership({ tier: VetTier.PRO }),
      });
      prisma.vetMembership.upsert.mockResolvedValue(
        activeMembership({ tier: VetTier.FREE }),
      );

      const result = await service.requestChange(USER_ID, VetTier.FREE);

      expect(prisma.vetProfile.update).toHaveBeenCalledWith({
        where: { id: VET_PROFILE_ID },
        data: { tier: VetTier.FREE },
      });
      expect(result.status).toBe(MembershipStatus.ACTIVE);
    });

    it("marks a paid-tier upgrade as PENDING_CHANGE without activating it or touching the current tier", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({
        id: VET_PROFILE_ID,
        tier: VetTier.FREE,
        membership: activeMembership({ tier: VetTier.FREE }),
      });
      prisma.vetMembership.update.mockResolvedValue(
        activeMembership({
          tier: VetTier.FREE,
          status: MembershipStatus.PENDING_CHANGE,
          requestedTier: VetTier.PRO,
          requestedMonthlyPriceCop: VET_MEMBERSHIP_PLANS.PRO.monthlyPriceCop,
        }),
      );

      const result = await service.requestChange(USER_ID, VetTier.PRO);

      expect(prisma.vetMembership.update).toHaveBeenCalledWith({
        where: { vetProfileId: VET_PROFILE_ID },
        data: expect.objectContaining({
          status: MembershipStatus.PENDING_CHANGE,
          requestedTier: VetTier.PRO,
          requestedMonthlyPriceCop: VET_MEMBERSHIP_PLANS.PRO.monthlyPriceCop,
        }),
      });
      // The actual tier/commission must NOT move until payment is confirmed.
      expect(prisma.vetProfile.update).not.toHaveBeenCalled();
      expect(result.status).toBe(MembershipStatus.PENDING_CHANGE);
      expect(result.note).toMatch(/pendiente hasta confirmar el cobro/);
    });
  });

  describe("approvePendingChange", () => {
    it("refuses when there is no membership row at all", async () => {
      prisma.vetMembership.findUnique.mockResolvedValue(null);
      await expect(
        service.approvePendingChange(VET_PROFILE_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses when there is no pending change to approve", async () => {
      prisma.vetMembership.findUnique.mockResolvedValue(
        activeMembership({ status: MembershipStatus.ACTIVE }),
      );
      await expect(
        service.approvePendingChange(VET_PROFILE_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a PENDING_CHANGE row that lost its requestedTier", async () => {
      prisma.vetMembership.findUnique.mockResolvedValue(
        activeMembership({
          status: MembershipStatus.PENDING_CHANGE,
          requestedTier: null,
        }),
      );
      await expect(
        service.approvePendingChange(VET_PROFILE_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("activates the requested tier and clears the pending request", async () => {
      prisma.vetMembership.findUnique.mockResolvedValue(
        activeMembership({
          status: MembershipStatus.PENDING_CHANGE,
          requestedTier: VetTier.ELITE,
        }),
      );
      prisma.vetMembership.upsert.mockResolvedValue(
        activeMembership({ tier: VetTier.ELITE }),
      );

      const result = await service.approvePendingChange(
        VET_PROFILE_ID,
        "bank transfer confirmed",
      );

      expect(prisma.vetProfile.update).toHaveBeenCalledWith({
        where: { id: VET_PROFILE_ID },
        data: { tier: VetTier.ELITE },
      });
      const [upsertArgs] = prisma.vetMembership.upsert.mock.calls[0];
      expect(upsertArgs.update).toEqual(
        expect.objectContaining({
          tier: VetTier.ELITE,
          status: MembershipStatus.ACTIVE,
          requestedTier: null,
          requestedMonthlyPriceCop: null,
          requestedAt: null,
          resolutionNote: "bank transfer confirmed",
        }),
      );
      expect(result.tier).toBe(VetTier.ELITE);
    });
  });

  describe("rejectPendingChange", () => {
    it("refuses when there is no membership row at all", async () => {
      prisma.vetMembership.findUnique.mockResolvedValue(null);
      await expect(
        service.rejectPendingChange(VET_PROFILE_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses when there is nothing pending to reject", async () => {
      prisma.vetMembership.findUnique.mockResolvedValue(
        activeMembership({ status: MembershipStatus.ACTIVE }),
      );
      await expect(
        service.rejectPendingChange(VET_PROFILE_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("reverts to ACTIVE on the current tier, leaving the vet's tier untouched", async () => {
      prisma.vetMembership.findUnique.mockResolvedValue(
        activeMembership({
          tier: VetTier.FREE,
          status: MembershipStatus.PENDING_CHANGE,
          requestedTier: VetTier.PRO,
        }),
      );
      prisma.vetMembership.update.mockResolvedValue(
        activeMembership({ tier: VetTier.FREE, status: MembershipStatus.ACTIVE }),
      );

      const result = await service.rejectPendingChange(VET_PROFILE_ID, "no payment received");

      expect(prisma.vetMembership.update).toHaveBeenCalledWith({
        where: { vetProfileId: VET_PROFILE_ID },
        data: {
          status: MembershipStatus.ACTIVE,
          requestedTier: null,
          requestedMonthlyPriceCop: null,
          requestedAt: null,
          resolutionNote: "no payment received",
        },
      });
      expect(prisma.vetProfile.update).not.toHaveBeenCalled();
      expect(result.status).toBe(MembershipStatus.ACTIVE);
    });

    it("defaults the resolution note when none is given", async () => {
      prisma.vetMembership.findUnique.mockResolvedValue(
        activeMembership({ status: MembershipStatus.PENDING_CHANGE, requestedTier: VetTier.PRO }),
      );
      prisma.vetMembership.update.mockResolvedValue(activeMembership());

      await service.rejectPendingChange(VET_PROFILE_ID);

      expect(prisma.vetMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resolutionNote: "membership_change_rejected",
          }),
        }),
      );
    });
  });

  describe("toResponse — billing mode", () => {
    it("marks FREE tier as FREE billing", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({
        id: VET_PROFILE_ID,
        tier: VetTier.FREE,
        membership: activeMembership({ tier: VetTier.FREE }),
      });

      const result = await service.getMyMembership(USER_ID);

      expect(result.billingMode).toBe("FREE");
    });

    it("marks a paid tier as EXTERNAL_CONFIRMATION billing", async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({
        id: VET_PROFILE_ID,
        tier: VetTier.PRO,
        membership: activeMembership({ tier: VetTier.PRO }),
      });

      const result = await service.getMyMembership(USER_ID);

      expect(result.billingMode).toBe("EXTERNAL_CONFIRMATION");
    });
  });
});
