import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CoverageModule } from "../coverage/coverage.module";
import {
  VetInvitationAdminController,
  VetInvitationPublicController,
} from "./vet-invitation.controller";
import { VetInvitationService } from "./vet-invitation.service";
import { VetRecruitmentController } from "./vet-recruitment.controller";
import { VetRecruitmentService } from "./vet-recruitment.service";

@Module({
  imports: [AuthModule, CoverageModule],
  controllers: [
    VetRecruitmentController,
    VetInvitationAdminController,
    VetInvitationPublicController,
  ],
  providers: [VetRecruitmentService, VetInvitationService],
  exports: [VetRecruitmentService, VetInvitationService],
})
export class VetRecruitmentModule {}
