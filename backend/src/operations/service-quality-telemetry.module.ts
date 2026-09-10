import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BetaModule } from "../beta/beta.module";
import { CoverageModule } from "../coverage/coverage.module";
import { ServiceQualityTelemetryController } from "./service-quality-telemetry.controller";
import { ServiceQualityTelemetryService } from "./service-quality-telemetry.service";

@Module({
  imports: [AuthModule, BetaModule, CoverageModule],
  controllers: [ServiceQualityTelemetryController],
  providers: [ServiceQualityTelemetryService],
  exports: [ServiceQualityTelemetryService],
})
export class ServiceQualityTelemetryModule {}
