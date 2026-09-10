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
  SendVetInvitationDto,
  VetInvitationTokenDto,
} from "./dto/vet-invitation.dto";
import {
  InvitationActor,
  VetInvitationService,
} from "./vet-invitation.service";
import { VetOutreachConsentService } from "./vet-outreach-consent.service";

@Controller("recruitment/vets")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
export class VetInvitationAdminController {
  constructor(
    private readonly invitations: VetInvitationService,
    private readonly outreachConsent: VetOutreachConsentService,
  ) {}

  @Get("invitations/summary")
  getSummary() {
    return this.invitations.getAdminSummary();
  }

  @Post(":leadId/invite")
  async sendInvitation(
    @Request() req,
    @Param("leadId") leadId: string,
    @Body() dto: SendVetInvitationDto,
  ) {
    await this.outreachConsent.assertEmailDeliveryAllowed(leadId);
    return this.invitations.sendInvitation(leadId, dto, this.getActor(req));
  }

  private getActor(req): InvitationActor {
    return {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip ?? req.headers?.["x-forwarded-for"],
      userAgent: req.headers?.["user-agent"],
    };
  }
}

@Controller("recruitment/vet-invitations")
export class VetInvitationPublicController {
  constructor(private readonly invitations: VetInvitationService) {}

  @Post("preview")
  preview(@Body() dto: VetInvitationTokenDto) {
    return this.invitations.previewInvitation(dto.token);
  }

  @Post("claim")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  claim(@Request() req, @Body() dto: VetInvitationTokenDto) {
    return this.invitations.claimInvitation(dto.token, req.user.id, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip ?? req.headers?.["x-forwarded-for"],
      userAgent: req.headers?.["user-agent"],
    });
  }
}
