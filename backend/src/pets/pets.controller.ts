import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { PetsService } from "./pets.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreatePetDto, UpdatePetDto } from "./dto/pet.dto";
import { UpdatePetHealthProfileDto } from "./dto/pet-health-profile.dto";

/**
 * PetsController — gestión de mascotas y expediente preventivo del cliente.
 *
 * Todos los endpoints requieren JWT. La capa de servicio conserva la
 * autoridad de ownership: los perfiles preventivos solo los modifica el dueño,
 * mientras un vet con una cita puede consultar el detalle de la mascota.
 */
@Controller("pets")
@UseGuards(JwtAuthGuard)
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Get("me")
  async getMyPets(@Request() req) {
    return this.petsService.getMyPets(req.user.id);
  }

  @Get("preventive/agenda")
  async getPreventiveAgenda(
    @Request() req,
    @Query("windowDays", new DefaultValuePipe(60), ParseIntPipe)
    windowDays: number,
  ) {
    return this.petsService.getPreventiveAgenda(req.user.id, windowDays);
  }

  @Get(":id")
  async getPetById(@Request() req, @Param("id", ParseUUIDPipe) id: string) {
    return this.petsService.getPetById(req.user.id, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPet(@Request() req, @Body() dto: CreatePetDto) {
    return this.petsService.createPet(req.user.id, dto);
  }

  @Patch(":id/health-profile")
  async updateHealthProfile(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePetHealthProfileDto,
  ) {
    return this.petsService.updateHealthProfile(req.user.id, id, dto);
  }

  @Patch(":id")
  async updatePet(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePetDto,
  ) {
    return this.petsService.updatePet(req.user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePet(@Request() req, @Param("id", ParseUUIDPipe) id: string) {
    await this.petsService.deletePet(req.user.id, id);
  }
}
