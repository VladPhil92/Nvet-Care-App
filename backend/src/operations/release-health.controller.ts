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
import { ReleaseHealthService } from "./release-health.service";

@Controller("operations")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
export class ReleaseHealthController {
  constructor(private readonly releaseHealth: ReleaseHealthService) {}

  @Get("release-health")
  getReleaseHealth(
    @Query("windowHours", new DefaultValuePipe(24), ParseIntPipe)
    windowHours: number,
  ) {
    return this.releaseHealth.getSnapshot(windowHours);
  }
}
