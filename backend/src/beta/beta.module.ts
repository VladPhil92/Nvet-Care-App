import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BetaActivationService } from "./beta-activation.service";
import { BetaCohortService } from "./beta-cohort.service";
import { BetaController } from "./beta.controller";
import { BetaEvidenceService } from "./beta-evidence.service";
import { BetaLegalConsentService } from "./beta-legal-consent.service";
import { BetaReadinessService } from "./beta-readiness.service";
import { ClosedBetaAccessService } from "./closed-beta-access.service";

@Module({
  imports: [AuthModule],
  controllers: [BetaController],
  providers: [
    BetaEvidenceService,
    BetaLegalConsentService,
    BetaCohortService,
    BetaActivationService,
    ClosedBetaAccessService,
    BetaReadinessService,
  ],
  exports: [
    BetaEvidenceService,
    BetaLegalConsentService,
    BetaCohortService,
    BetaActivationService,
    ClosedBetaAccessService,
    BetaReadinessService,
  ],
})
export class BetaModule {}
