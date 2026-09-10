import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CoverageModule } from "../coverage/coverage.module";
import { VetActivationTelemetryService } from "./vet-activation-telemetry.service";
import {
  VetInvitationAdminController,
  VetInvitationPublicController,
} from "./vet-invitation.controller";
import { VetInvitationService } from "./vet-invitation.service";
import { VetOutreachConsentController } from "./vet-outreach-consent.controller";
import { VetOutreachConsentService } from "./vet-outreach-consent.service";
import { VetRecruitmentController } from "./vet-recruitment.controller";
import { VetRecruitmentService } from "./vet-recruitment.service";

@Module({
  imports: [AuthModule, CoverageModule],
  controllers: [
    VetRecruitmentController,
    VetInvitationAdminController,
    VetInvitationPublicController,
    VetOutreachConsentController,
  ],
  providers: [
    VetRecruitmentService,
    VetInvitationService,
    VetOutreachConsentService,
    VetActivationTelemetryService,
  ],
  exports: [
    VetRecruitmentService,
    VetInvitationService,
    VetOutreachConsentService,
    VetActivationTelemetryService,
  ],
})
export class VetRecruitmentModule {}
