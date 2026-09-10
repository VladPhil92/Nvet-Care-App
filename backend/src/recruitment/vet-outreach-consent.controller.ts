import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import {
  GrantVetOutreachConsentDto,
  RevokeVetOutreachConsentDto,
} from "./dto/vet-outreach-consent.dto";
import {
  VetOutreachActor,
  VetOutreachConsentService,
} from "./vet-outreach-consent.service";

@Controller("recruitment/vets")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
export class VetOutreachConsentController {
  constructor(private readonly consent: VetOutreachConsentService) {}

  @Get("contact-permissions/summary")
  getSummary() {
    return this.consent.getAdminSummary();
  }

  @Get(":leadId/contact-permission")
  getStatus(@Param("leadId") leadId: string) {
    return this.consent.getStatus(leadId);
  }

  @Post(":leadId/contact-permission")
  grant(
    @Request() req,
    @Param("leadId") leadId: string,
    @Body() dto: GrantVetOutreachConsentDto,
  ) {
    return this.consent.grant(leadId, dto, this.getActor(req));
  }

  @Post(":leadId/contact-permission/revoke")
  revoke(
    @Request() req,
    @Param("leadId") leadId: string,
    @Body() dto: RevokeVetOutreachConsentDto,
  ) {
    return this.consent.revoke(leadId, dto.reason, this.getActor(req));
  }

  private getActor(req): VetOutreachActor {
    return {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip ?? req.headers?.["x-forwarded-for"],
      userAgent: req.headers?.["user-agent"],
    };
  }
}
