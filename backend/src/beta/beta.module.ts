import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BetaController } from "./beta.controller";
import { BetaReadinessService } from "./beta-readiness.service";
import { ClosedBetaAccessService } from "./closed-beta-access.service";

@Module({
  imports: [AuthModule],
  controllers: [BetaController],
  providers: [ClosedBetaAccessService, BetaReadinessService],
  exports: [ClosedBetaAccessService, BetaReadinessService],
})
export class BetaModule {}
