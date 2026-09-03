import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { ProfessionalRegistryService } from "./professional-registry.service";
import { RecordProfessionalRegistryCheckDto } from "./dto/professional-registry.dto";

@Controller("vets/registry")
@UseGuards(JwtAuthGuard)
export class ProfessionalRegistryController {
  constructor(
    private readonly professionalRegistryService: ProfessionalRegistryService,
  ) {}

  @Get("me")
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  async getMyRegistryStatus(@Request() req) {
    return this.professionalRegistryService.getForUser(req.user.id);
  }

  @Get("admin/:vetProfileId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getRegistryStatus(
    @Param("vetProfileId", ParseUUIDPipe) vetProfileId: string,
  ) {
    return this.professionalRegistryService.getForVetProfile(vetProfileId);
  }

  @Post("admin/:vetProfileId/check")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async recordRegistryCheck(
    @Request() req,
    @Param("vetProfileId", ParseUUIDPipe) vetProfileId: string,
    @Body() dto: RecordProfessionalRegistryCheckDto,
  ) {
    return this.professionalRegistryService.recordCheck(
      req.user.id,
      vetProfileId,
      dto,
    );
  }
}
