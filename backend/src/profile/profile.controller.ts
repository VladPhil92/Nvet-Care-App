import {
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Body,
  Req,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProfileService } from "./profile.service";
import { UpdateClientProfileDto } from "./dto/update-client-profile.dto";

@Controller("profile")
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async getClientProfile(@Req() req: any) {
    this.assertClientMode(req.user?.role);
    return this.profileService.getClientProfile(req.user.id);
  }

  @Patch()
  async updateClientProfile(
    @Req() req: any,
    @Body() dto: UpdateClientProfileDto,
  ) {
    this.assertClientMode(req.user?.role);
    return this.profileService.updateClientProfile(req.user.id, dto);
  }

  private assertClientMode(role: UserRole | undefined): void {
    // This checks the effective role established by JwtStrategy. The canonical
    // SUPERADMIN can therefore use Account Center only after explicitly
    // switching to CLIENT mode; ADMIN/VET authority never leaks into it.
    if (role !== UserRole.CLIENT) {
      throw new ForbiddenException(
        "El centro de cuenta está disponible únicamente en modo usuario",
      );
    }
  }
}
