import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MembershipStatus, VetTier } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VET_MEMBERSHIP_PLANS, getMembershipPlan } from "./commercial-policy";

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  getPlans() {
    return Object.values(VET_MEMBERSHIP_PLANS);
  }

  async getMyMembership(userId: string) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
      include: { membership: true },
    });

    if (!vet) {
      throw new NotFoundException("Vet profile not found");
    }

    const membership =
      vet.membership ??
      (await this.createMembershipForExistingVet(vet.id, vet.tier));

    // Si un admin actualizó el tier por la ruta legacy, reconciliamos el estado
    // para que no quede una solicitud pendiente ya resuelta de facto.
    if (
      membership.status === MembershipStatus.PENDING_CHANGE &&
      membership.requestedTier === vet.tier
    ) {
      const reconciled = await this.activateTier(vet.id, vet.tier);
      return this.toResponse(reconciled);
    }

    // El VetProfile sigue siendo la autoridad efectiva para comisiones. Si por
    // cualquier motivo difiere del snapshot de membresía, lo sincronizamos.
    if (membership.tier !== vet.tier) {
      const reconciled = await this.activateTier(vet.id, vet.tier);
      return this.toResponse(reconciled);
    }

    return this.toResponse(membership);
  }

  async requestChange(userId: string, requestedTier: VetTier) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
      include: { membership: true },
    });

    if (!vet) {
      throw new NotFoundException("Vet profile not found");
    }

    const membership =
      vet.membership ??
      (await this.createMembershipForExistingVet(vet.id, vet.tier));

    if (requestedTier === vet.tier) {
      return this.toResponse(membership);
    }

    // Free no requiere cobro: el downgrade se aplica inmediatamente.
    if (requestedTier === VetTier.FREE) {
      const updated = await this.activateTier(vet.id, VetTier.FREE);
      return this.toResponse(updated);
    }

    const requestedPlan = getMembershipPlan(requestedTier);
    const updated = await this.prisma.vetMembership.update({
      where: { vetProfileId: vet.id },
      data: {
        status: MembershipStatus.PENDING_CHANGE,
        requestedTier,
        requestedMonthlyPriceCop: requestedPlan.monthlyPriceCop,
        requestedAt: new Date(),
        resolutionNote: null,
      },
    });

    return this.toResponse(updated);
  }

  async approvePendingChange(vetProfileId: string, note?: string) {
    const membership = await this.prisma.vetMembership.findUnique({
      where: { vetProfileId },
    });

    if (!membership) {
      throw new NotFoundException("Membership not found");
    }
    if (
      membership.status !== MembershipStatus.PENDING_CHANGE ||
      !membership.requestedTier
    ) {
      throw new BadRequestException("No pending membership change to approve");
    }

    const updated = await this.activateTier(
      vetProfileId,
      membership.requestedTier,
      note,
    );
    return this.toResponse(updated);
  }

  async rejectPendingChange(vetProfileId: string, note?: string) {
    const membership = await this.prisma.vetMembership.findUnique({
      where: { vetProfileId },
    });

    if (!membership) {
      throw new NotFoundException("Membership not found");
    }
    if (membership.status !== MembershipStatus.PENDING_CHANGE) {
      throw new BadRequestException("No pending membership change to reject");
    }

    const updated = await this.prisma.vetMembership.update({
      where: { vetProfileId },
      data: {
        status: MembershipStatus.ACTIVE,
        requestedTier: null,
        requestedMonthlyPriceCop: null,
        requestedAt: null,
        resolutionNote: note ?? "membership_change_rejected",
      },
    });

    return this.toResponse(updated);
  }

  private async createMembershipForExistingVet(
    vetProfileId: string,
    tier: VetTier,
  ) {
    const plan = getMembershipPlan(tier);
    const { start, end } = this.periodForTier(tier);

    return this.prisma.vetMembership.create({
      data: {
        vetProfileId,
        tier,
        status: MembershipStatus.ACTIVE,
        monthlyPriceCop: plan.monthlyPriceCop,
        commissionPct: plan.commissionPct,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });
  }

  private async activateTier(
    vetProfileId: string,
    tier: VetTier,
    resolutionNote?: string,
  ) {
    const plan = getMembershipPlan(tier);
    const { start, end } = this.periodForTier(tier);

    return this.prisma.$transaction(async (tx) => {
      await tx.vetProfile.update({
        where: { id: vetProfileId },
        data: { tier },
      });

      return tx.vetMembership.upsert({
        where: { vetProfileId },
        create: {
          vetProfileId,
          tier,
          status: MembershipStatus.ACTIVE,
          monthlyPriceCop: plan.monthlyPriceCop,
          commissionPct: plan.commissionPct,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          resolutionNote,
        },
        update: {
          tier,
          status: MembershipStatus.ACTIVE,
          monthlyPriceCop: plan.monthlyPriceCop,
          commissionPct: plan.commissionPct,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          requestedTier: null,
          requestedMonthlyPriceCop: null,
          requestedAt: null,
          resolutionNote: resolutionNote ?? null,
        },
      });
    });
  }

  private periodForTier(tier: VetTier) {
    const start = new Date();
    if (tier === VetTier.FREE) {
      return { start, end: null as Date | null };
    }
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  private toResponse(membership: any) {
    const activePlan = getMembershipPlan(membership.tier);
    const requestedPlan = membership.requestedTier
      ? getMembershipPlan(membership.requestedTier)
      : null;

    return {
      id: membership.id,
      tier: membership.tier,
      status: membership.status,
      activePlan,
      requestedTier: membership.requestedTier,
      requestedPlan,
      requestedAt: membership.requestedAt,
      currentPeriodStart: membership.currentPeriodStart,
      currentPeriodEnd: membership.currentPeriodEnd,
      billingMode:
        membership.tier === VetTier.FREE ? "FREE" : "EXTERNAL_CONFIRMATION",
      note:
        membership.status === MembershipStatus.PENDING_CHANGE
          ? "El cambio de plan pago queda pendiente hasta confirmar el cobro. El tier actual y su comisión continúan vigentes mientras tanto."
          : null,
    };
  }
}
