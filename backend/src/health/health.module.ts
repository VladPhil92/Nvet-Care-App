import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

/**
 * HealthModule — módulo público sin dependencias de auth.
 * PrismaService viene de PrismaModule (global).
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
