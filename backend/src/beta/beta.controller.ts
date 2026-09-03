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
import { BetaActivationService } from "./beta-activation.service";
import { BetaCohortService } from "./beta-cohort.service";
import {
  BetaEvidenceActor,
  BetaEvidenceService,
} from "./beta-evidence.service";
import { BetaLegalConsentService } from "./beta-legal-consent.service";
import { BetaReadinessService } from "./beta-readiness.service";
import { ClosedBetaAccessService } from "./closed-beta-access.service";
import { AcceptBetaLegalDto } from "./dto/accept-beta-legal.dto";
import {
  AuthorizeBetaActivationDto,
  RevokeBetaActivationDto,
} from "./dto/beta-activation.dto";
import {
  InviteBetaCohortMemberDto,
  RevokeBetaCohortMemberDto,
} from "./dto/beta-cohort.dto";
import {
  DecideBetaEvidenceDto,
  SubmitBetaEvidenceDto,
} from "./dto/beta-evidence.dto";

@Controller("beta")
@UseGuards(JwtAuthGuard, RolesGuard)
export class BetaController {
  constructor(
    private readonly access: ClosedBetaAccessService,
    private readonly readiness: BetaReadinessService,
    private readonly legalConsent: BetaLegalConsentService,
    private readonly evidence: BetaEvidenceService,
    private readonly activation: BetaActivationService,
    private readonly cohort: BetaCohortService,
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

  @Get("cohort/me")
  @Roles(UserRole.CLIENT)
  getMyCohortStatus(@Request() req) {
    return this.cohort.getSelfStatus(req.user.id);
  }

  @Get("cohort")
  @Roles(UserRole.ADMIN)
  getCohort() {
    return this.cohort.getAdminSnapshot();
  }

  @Post("cohort/invite")
  @Roles(UserRole.ADMIN)
  inviteCohortMember(
    @Request() req,
    @Body() dto: InviteBetaCohortMemberDto,
  ) {
    return this.cohort.invite(dto, this.getEvidenceActor(req));
  }

  @Post("cohort/:userId/revoke")
  @Roles(UserRole.ADMIN)
  revokeCohortMember(
    @Request() req,
    @Param("userId") userId: string,
    @Body() dto: RevokeBetaCohortMemberDto,
  ) {
    return this.cohort.revoke(userId, dto, this.getEvidenceActor(req));
  }

  @Get("activation")
  @Roles(UserRole.ADMIN)
  async getActivation() {
    const [status, prerequisites] = await Promise.all([
      this.activation.getStatus(),
      this.activation.getPrerequisites(),
    ]);
    return {
      status,
      prerequisites,
      authorizationRequiredForBooking: true,
      commercialLaunchAuthorized: false,
    } as const;
  }

  @Post("activation/authorize")
  @Roles(UserRole.ADMIN)
  authorizeActivation(@Request() req, @Body() dto: AuthorizeBetaActivationDto) {
    return this.activation.authorize(dto, this.getEvidenceActor(req));
  }

  @Post("activation/revoke")
  @Roles(UserRole.ADMIN)
  revokeActivation(@Request() req, @Body() dto: RevokeBetaActivationDto) {
    return this.activation.revoke(dto, this.getEvidenceActor(req));
  }

  @Get("evidence/summary")
  @Roles(UserRole.ADMIN)
  getEvidenceSummary() {
    return this.evidence.getPromotionSummary();
  }

  @Get("evidence/history")
  @Roles(UserRole.ADMIN)
  getEvidenceHistory() {
    return this.evidence.getHistory();
  }

  @Post("evidence")
  @Roles(UserRole.ADMIN)
  submitEvidence(@Request() req, @Body() dto: SubmitBetaEvidenceDto) {
    return this.evidence.submit(dto, this.getEvidenceActor(req));
  }

  @Post("evidence/:evidenceId/approve")
  @Roles(UserRole.ADMIN)
  approveEvidence(
    @Request() req,
    @Param("evidenceId") evidenceId: string,
    @Body() dto: DecideBetaEvidenceDto,
  ) {
    return this.evidence.approve(evidenceId, dto, this.getEvidenceActor(req));
  }

  @Post("evidence/:evidenceId/reject")
  @Roles(UserRole.ADMIN)
  rejectEvidence(
    @Request() req,
    @Param("evidenceId") evidenceId: string,
    @Body() dto: DecideBetaEvidenceDto,
  ) {
    return this.evidence.reject(evidenceId, dto, this.getEvidenceActor(req));
  }

  @Post("evidence/:evidenceId/revoke")
  @Roles(UserRole.ADMIN)
  revokeEvidence(
    @Request() req,
    @Param("evidenceId") evidenceId: string,
    @Body() dto: DecideBetaEvidenceDto,
  ) {
    return this.evidence.revoke(evidenceId, dto, this.getEvidenceActor(req));
  }

  private getEvidenceActor(req): BetaEvidenceActor {
    return {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip ?? req.headers?.["x-forwarded-for"],
      userAgent: req.headers?.["user-agent"],
    };
  }
}
