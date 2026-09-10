import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CoverageController } from "./coverage.controller";
import { CoverageService } from "./coverage.service";

@Module({
  imports: [AuthModule],
  controllers: [CoverageController],
  providers: [CoverageService],
  exports: [CoverageService],
})
export class CoverageModule {}
