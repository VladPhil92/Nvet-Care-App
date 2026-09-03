import { Controller, Get, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { BetaReadinessService } from "./beta-readiness.service";
import { ClosedBetaAccessService } from "./closed-beta-access.service";

@Controller("beta")
@UseGuards(JwtAuthGuard, RolesGuard)
export class BetaController {
  constructor(
    private readonly access: ClosedBetaAccessService,
    private readonly readiness: BetaReadinessService,
  ) {}

  @Get("policy")
  @Roles(UserRole.CLIENT, UserRole.VET, UserRole.ADMIN)
  getPolicy() {
    return this.access.getPublicPolicy();
  }

  @Get("readiness")
  @Roles(UserRole.ADMIN)
  getReadiness() {
    return this.readiness.getCartagenaSnapshot();
  }
}
