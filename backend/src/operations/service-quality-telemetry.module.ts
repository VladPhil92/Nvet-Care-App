import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BetaModule } from "../beta/beta.module";
import { CoverageModule } from "../coverage/coverage.module";
import { HealthModule } from "../health/health.module";
import { ReleaseHealthController } from "./release-health.controller";
import { ReleaseHealthService } from "./release-health.service";
import { RuntimeTelemetryController } from "./runtime-telemetry.controller";
import { RuntimeTelemetryService } from "./runtime-telemetry.service";
import { ServiceQualityTelemetryController } from "./service-quality-telemetry.controller";
import { ServiceQualityTelemetryService } from "./service-quality-telemetry.service";

@Module({
  imports: [AuthModule, BetaModule, CoverageModule, HealthModule],
  controllers: [
    ServiceQualityTelemetryController,
    RuntimeTelemetryController,
    ReleaseHealthController,
  ],
  providers: [
    ServiceQualityTelemetryService,
    RuntimeTelemetryService,
    ReleaseHealthService,
  ],
  exports: [
    ServiceQualityTelemetryService,
    RuntimeTelemetryService,
    ReleaseHealthService,
  ],
})
export class ServiceQualityTelemetryModule {}
