import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CoverageService } from "./coverage.service";
import { MarketLaunchPolicyService } from "./market-launch-policy.service";
import { VetSupplyReadinessService } from "./vet-supply-readiness.service";
import { CoveragePointQueryDto } from "./dto/coverage-query.dto";

@Controller("coverage")
export class CoverageController {
  constructor(
    private readonly coverage: CoverageService,
    private readonly launchPolicy: MarketLaunchPolicyService,
    private readonly vetSupply: VetSupplyReadinessService,
  ) {}

  /** Public launch-market catalog. Never exposes veterinarian coordinates. */
  @Get("markets")
  getMarkets() {
    return this.coverage.getCatalog();
  }

  /**
   * Public point check used by web/mobile to distinguish active, prelaunch and
   * unsupported locations before the user reaches checkout.
   */
  @Get("check")
  checkPoint(@Query() query: CoveragePointQueryDto) {
    return this.coverage.getPointCoverage(query.latitude, query.longitude);
  }

  /** Operational counts and activation readiness are admin-only. */
  @Get("readiness")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getReadiness() {
    return this.coverage.getReadinessSnapshot();
  }

  /**
   * Phase 15 launch lock snapshot. Distinguishes provider intent from the
   * effective booking gate and never claims commercial launch authorization.
   */
  @Get("launch-policy")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getLaunchPolicy() {
    return this.launchPolicy.getPolicySnapshot();
  }

  /**
   * Phase 17 aggregate veterinarian acquisition/verification funnel by market.
   * Admin-only and deliberately excludes veterinarian identities and exact
   * coordinates so readiness can be managed without exposing PII.
   */
  @Get("supply-funnel")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getSupplyFunnel() {
    return this.vetSupply.getSupplyFunnelSnapshot();
  }
}
