import { Injectable } from "@nestjs/common";
import { VerificationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ClosedBetaAccessService } from "./closed-beta-access.service";

const MAX_INITIAL_CLIENTS = 50;
const MIN_VERIFIED_VETS = 3;

@Injectable()
export class BetaReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClosedBetaAccessService,
  ) {}

  async getCartagenaSnapshot() {
    const verifiedActiveVets = await this.prisma.vetProfile.count({
      where: {
        isVerified: true,
        isActive: true,
        verificationStatus: VerificationStatus.APPROVED,
        city: {
          contains: "cartagena",
          mode: "insensitive",
        },
      },
    });

    const configuredClients = this.access.getConfiguredClientCount();
    const cohortConfigured = configuredClients > 0;
    const cohortWithinLimit = configuredClients <= MAX_INITIAL_CLIENTS;
    const vetCoverageSatisfied = verifiedActiveVets >= MIN_VERIFIED_VETS;

    return {
      phase: 12,
      program: "closed-beta-cartagena",
      market: this.access.getMarket(),
      runtime: {
        closedBetaEnabled: this.access.isEnabled(),
        bookingEnabled: this.access.isBookingEnabled(),
      },
      cohort: {
        configured: cohortConfigured,
        configuredClients,
        maxInitialClients: MAX_INITIAL_CLIENTS,
        withinLimit: cohortWithinLimit,
      },
      vetCoverage: {
        verifiedActiveVets,
        minimumRequired: MIN_VERIFIED_VETS,
        satisfied: vetCoverageSatisfied,
      },
      localActivationReady:
        cohortConfigured && cohortWithinLimit && vetCoverageSatisfied,
      privacy: {
        rawClientIdentifiersExposed: false,
        cohortHashesExposed: false,
      },
      generatedAt: new Date().toISOString(),
    } as const;
  }
}
