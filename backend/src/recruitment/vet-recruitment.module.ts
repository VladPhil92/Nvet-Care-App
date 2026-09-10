import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CoverageModule } from "../coverage/coverage.module";
import { VetRecruitmentController } from "./vet-recruitment.controller";
import { VetRecruitmentService } from "./vet-recruitment.service";

@Module({
  imports: [AuthModule, CoverageModule],
  controllers: [VetRecruitmentController],
  providers: [VetRecruitmentService],
  exports: [VetRecruitmentService],
})
export class VetRecruitmentModule {}
