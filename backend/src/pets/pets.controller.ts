import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from "@nestjs/common";
import { PetsService } from "./pets.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreatePetDto, UpdatePetDto } from "./dto/pet.dto";

/**
 * PetsController — gestión de mascotas del cliente.
 *
 * Todos los endpoints requieren autenticación JWT.
 * No están restringidos a un rol específico porque:
 *  - Los clientes gestionan sus propias mascotas.
 *  - Los vets pueden consultar mascotas de sus citas activas (GET /:id).
 *
 * Mapa de endpoints:
 *   GET    /pets/me      — listar mis mascotas (cliente)
 *   GET    /pets/:id     — detalle (dueño o vet con cita)
 *   POST   /pets         — crear mascota (cliente)
 *   PATCH  /pets/:id     — actualizar (solo dueño)
 *   DELETE /pets/:id     — eliminar (solo dueño, sin citas activas)
 */
@Controller("pets")
@UseGuards(JwtAuthGuard)
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  /**
   * GET /pets/me
   * Lista todas las mascotas del usuario autenticado.
   */
  @Get("me")
  async getMyPets(@Request() req) {
    return this.petsService.getMyPets(req.user.id);
  }

  /**
   * GET /pets/:id
   * Obtiene el detalle de una mascota.
   * Accesible por el dueño o por el vet asignado a una cita de esa mascota.
   */
  @Get(":id")
  async getPetById(@Request() req, @Param("id", ParseUUIDPipe) id: string) {
    return this.petsService.getPetById(req.user.id, id);
  }

  /**
   * POST /pets
   * Crea una nueva mascota para el cliente autenticado.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPet(@Request() req, @Body() dto: CreatePetDto) {
    return this.petsService.createPet(req.user.id, dto);
  }

  /**
   * PATCH /pets/:id
   * Actualiza los datos de una mascota. Solo el dueño.
   */
  @Patch(":id")
  async updatePet(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePetDto,
  ) {
    return this.petsService.updatePet(req.user.id, id, dto);
  }

  /**
   * DELETE /pets/:id
   * Elimina una mascota. Solo el dueño y sin citas activas.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePet(@Request() req, @Param("id", ParseUUIDPipe) id: string) {
    await this.petsService.deletePet(req.user.id, id);
  }
}
