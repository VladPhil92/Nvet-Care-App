import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { BetaLegalConsentService } from "./beta-legal-consent.service";
import { BetaReadinessService } from "./beta-readiness.service";
import { ClosedBetaAccessService } from "./closed-beta-access.service";
import { AcceptBetaLegalDto } from "./dto/accept-beta-legal.dto";

@Controller("beta")
@UseGuards(JwtAuthGuard, RolesGuard)
export class BetaController {
  constructor(
    private readonly access: ClosedBetaAccessService,
    private readonly readiness: BetaReadinessService,
    private readonly legalConsent: BetaLegalConsentService,
  ) {}

  @Get("policy")
  @Roles(UserRole.CLIENT, UserRole.VET, UserRole.ADMIN)
  getPolicy() {
    return this.access.getPublicPolicy();
  }

  @Get("legal")
  @Roles(UserRole.CLIENT, UserRole.VET, UserRole.ADMIN)
  getLegalStatus(@Request() req) {
    return this.legalConsent.getStatus(req.user.id);
  }

  @Post("legal/accept")
  @Roles(UserRole.CLIENT, UserRole.VET)
  acceptLegal(@Request() req, @Body() dto: AcceptBetaLegalDto) {
    return this.legalConsent.accept(req.user.id, req.user.role, dto);
  }

  @Get("readiness")
  @Roles(UserRole.ADMIN)
  getReadiness() {
    return this.readiness.getCartagenaSnapshot();
  }
}
