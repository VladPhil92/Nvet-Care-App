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
  UseInterceptors,
  UploadedFile,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@prisma/client";
import { PetsService } from "./pets.service";
import { ClinicalRecordService } from "./clinical-record.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
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
  constructor(
    private readonly petsService: PetsService,
    private readonly clinicalRecordService: ClinicalRecordService,
  ) {}

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

  @Get(":id/clinical-record")
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT)
  async getClinicalRecord(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.clinicalRecordService.getClientRecord(req.user.id, id);
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

  @Post(":id/photo")
  @UseInterceptors(FileInterceptor("file"))
  async uploadPhoto(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const publicBaseUrl = `${req.protocol}://${req.get("host")}`;
    return this.petsService.updatePhoto(req.user.id, id, file, publicBaseUrl);
  }

  @Delete(":id/photo")
  async deletePhoto(@Request() req, @Param("id", ParseUUIDPipe) id: string) {
    return this.petsService.removePhoto(req.user.id, id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePet(@Request() req, @Param("id", ParseUUIDPipe) id: string) {
    await this.petsService.deletePet(req.user.id, id);
  }
}
