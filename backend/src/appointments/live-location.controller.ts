import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Request,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UpdateLiveLocationDto } from "./dto/update-live-location.dto";
import { LiveLocationService } from "./live-location.service";

@Controller("appointments")
@UseGuards(JwtAuthGuard)
export class LiveLocationController {
  constructor(private readonly liveLocationService: LiveLocationService) {}

  @Get(":id/live-location")
  async getLiveLocation(@Param("id") id: string, @Request() req) {
    return this.liveLocationService.getLiveLocation(
      id,
      req.user.id,
      req.user.role,
    );
  }

  @Patch(":id/live-location")
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  async updateLiveLocation(
    @Param("id") id: string,
    @Request() req,
    @Body() dto: UpdateLiveLocationDto,
  ) {
    return this.liveLocationService.updateLiveLocation(id, req.user.id, dto);
  }
}
