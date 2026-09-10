import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ServiceQualityTelemetryService } from "./service-quality-telemetry.service";

@Controller("operations")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
export class ServiceQualityTelemetryController {
  constructor(private readonly telemetry: ServiceQualityTelemetryService) {}

  @Get("service-quality")
  getServiceQuality(
    @Query("windowHours", new DefaultValuePipe(168), ParseIntPipe)
    windowHours: number,
    @Query("marketDaneCode") marketDaneCode?: string,
  ) {
    return this.telemetry.getSnapshot({
      windowHours,
      marketDaneCode: marketDaneCode?.trim() || undefined,
    });
  }
}
