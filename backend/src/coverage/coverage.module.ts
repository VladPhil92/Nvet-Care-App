import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "../auth/auth.module";
import { CoverageController } from "./coverage.controller";
import { CoverageService } from "./coverage.service";
import { MarketLaunchGuard } from "./market-launch.guard";
import { MarketLaunchPolicyService } from "./market-launch-policy.service";

@Module({
  imports: [AuthModule],
  controllers: [CoverageController],
  providers: [
    CoverageService,
    MarketLaunchPolicyService,
    {
      provide: APP_GUARD,
      useClass: MarketLaunchGuard,
    },
  ],
  exports: [CoverageService, MarketLaunchPolicyService],
})
export class CoverageModule {}
