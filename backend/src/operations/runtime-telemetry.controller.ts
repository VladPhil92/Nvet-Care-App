import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { RuntimeTelemetryEventDto } from "./dto/runtime-telemetry-event.dto";
import { RuntimeTelemetryService } from "./runtime-telemetry.service";

@Controller("operations/runtime-telemetry")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RuntimeTelemetryController {
  constructor(private readonly telemetry: RuntimeTelemetryService) {}

  @Post("events")
  @Roles(UserRole.CLIENT, UserRole.VET, UserRole.ADMIN, UserRole.SUPERADMIN)
  record(@Body() dto: RuntimeTelemetryEventDto) {
    return this.telemetry.record(dto);
  }

  @Get("snapshot")
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  snapshot(
    @Query("windowHours", new DefaultValuePipe(24), ParseIntPipe)
    windowHours: number,
  ) {
    return this.telemetry.getSnapshot(windowHours);
  }
}
