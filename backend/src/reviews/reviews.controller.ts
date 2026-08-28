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
} from "@nestjs/common";
import { ReviewsService } from "./reviews.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { EmailVerifiedGuard } from "../auth/guards/email-verified.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import {
  CreateReviewDto,
  UpdateReviewDto,
  VetReviewsFilterDto,
} from "./dto/review.dto";

/**
 * ReviewsController — sistema de calificaciones.
 *
 * Endpoints públicos (sin auth):
 *   GET  /reviews/vets/:vetId          — reviews de un vet (paginado, filtrable)
 *
 * Endpoints autenticados (cliente):
 *   POST   /reviews                   — crear review (cita COMPLETED, una por cita)
 *   PATCH  /reviews/:id               — editar propia review
 *   DELETE /reviews/:id               — eliminar propia review
 *   GET    /reviews/me                — mis calificaciones como cliente
 *   GET    /reviews/appointment/:id   — review de una cita específica
 *
 * Endpoints admin:
 *   DELETE /reviews/:id/admin         — eliminar cualquier review (moderación)
 */
@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ============================================================
  // PÚBLICO — reviews de un vet
  // ============================================================

  /**
   * GET /reviews/vets/:vetId
   * Lista las reviews de un vet. Público — usado en VetDetailsScreen.
   * El `:vetId` puede ser el `id` del perfil o el `userId` del vet.
   */
  @Get("vets/:vetId")
  async getVetReviews(
    @Param("vetId", ParseUUIDPipe) vetId: string,
    @Query() filters: VetReviewsFilterDto,
  ) {
    return this.reviewsService.getVetReviews(vetId, filters);
  }

  // ============================================================
  // AUTENTICADO — cliente
  // ============================================================

  /**
   * POST /reviews
   * Crea una calificación para una cita completada.
   * Requiere: email verificado (anti-abuso de cuentas spam).
   */
  @Post()
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async createReview(@Request() req, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(req.user.id, dto);
  }

  /**
   * GET /reviews/me
   * Lista las propias reviews del cliente autenticado.
   */
  @Get("me")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  async getMyReviews(@Request() req, @Query() filters: VetReviewsFilterDto) {
    return this.reviewsService.getMyReviews(req.user.id, filters);
  }

  /**
   * GET /reviews/appointment/:appointmentId
   * Obtiene la review de una cita específica (o null si no existe aún).
   * Usado para saber si el cliente ya calificó esa cita.
   */
  @Get("appointment/:appointmentId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  async getAppointmentReview(
    @Request() req,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.reviewsService.getAppointmentReview(req.user.id, appointmentId);
  }

  /**
   * PATCH /reviews/:id
   * Editar rating o comentario de una review propia.
   */
  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  async updateReview(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.updateReview(req.user.id, id, dto);
  }

  /**
   * DELETE /reviews/:id
   * Eliminar review propia (el cliente arrepentido puede hacerlo).
   */
  @Delete(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReview(@Request() req, @Param("id", ParseUUIDPipe) id: string) {
    await this.reviewsService.deleteReview(req.user.id, id, false);
  }

  /**
   * DELETE /reviews/:id/admin
   * Moderación: admin elimina cualquier review abusiva o falsa.
   */
  @Delete(":id/admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async adminDeleteReview(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.reviewsService.deleteReview(req.user.id, id, true);
  }
}
