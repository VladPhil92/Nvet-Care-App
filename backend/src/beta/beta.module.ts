import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BetaController } from "./beta.controller";
import { BetaLegalConsentService } from "./beta-legal-consent.service";
import { BetaReadinessService } from "./beta-readiness.service";
import { ClosedBetaAccessService } from "./closed-beta-access.service";

@Module({
  imports: [AuthModule],
  controllers: [BetaController],
  providers: [
    BetaLegalConsentService,
    ClosedBetaAccessService,
    BetaReadinessService,
  ],
  exports: [
    BetaLegalConsentService,
    ClosedBetaAccessService,
    BetaReadinessService,
  ],
})
export class BetaModule {}
