import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
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
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

import { VetsService } from './vets.service';
import { VerificationService } from './verification.service';
import { PricesService } from './prices.service';

import { SearchVetsDto } from './dto/search-vets.dto';
import { UpdateVetProfileDto } from './dto/update-vet-profile.dto';
import {
  CreatePriceDto,
  UpdatePriceDto,
  BulkCreatePricesDto,
} from './dto/price.dto';
import {
  UploadDocumentDto,
  ApproveDocumentDto,
  RejectDocumentDto,
  CreateVetProfileDto,
} from './dto/verification.dto';

/**
 * VetsController — punto de entrada HTTP para todo el dominio veterinario.
 *
 * Responsabilidades:
 *  - Búsqueda y descubrimiento de vets (públicos)
 *  - Gestión del perfil propio (vet autenticado)
 *  - Verificación profesional (upload + status)
 *  - CRUD de precios (vet propio)
 *  - Earnings y analytics (vet propio)
 *  - Aprobación/rechazo de documentos (admin)
 *
 * Convenciones:
 *  - Endpoints públicos: GET /vets, GET /vets/:id (sin auth)
 *  - Endpoints "me": requieren JWT + role VET
 *  - Endpoints admin: requieren JWT + role ADMIN
 */
@Controller('vets')
export class VetsController {
  constructor(
    private readonly vetsService: VetsService,
    private readonly verificationService: VerificationService,
    private readonly pricesService: PricesService,
  ) {}

  // ============================================================
  // BÚSQUEDA Y DESCUBRIMIENTO (público)
  // ============================================================

  /**
   * GET /vets — búsqueda avanzada con geolocalización y filtros.
   * Endpoint público (no requiere auth) para el flujo de descubrimiento del cliente.
   */
  @Get()
  async searchVets(@Query() filters: SearchVetsDto) {
    return this.vetsService.searchVets(filters);
  }

  // ============================================================
  // PERFIL PROPIO DEL VETERINARIO
  // (rutas estáticas /me/* deben ir ANTES de /:id para evitar colisión)
  // ============================================================

  /**
   * GET /vets/me — perfil completo del vet autenticado.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async getMyProfile(@Request() req) {
    return this.vetsService.getMyVetProfile(req.user.id);
  }

  /**
   * POST /vets/me — crear perfil de vet (primera vez tras registro).
   */
  @Post('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  async createProfile(
    @Request() req,
    @Body() dto: CreateVetProfileDto,
  ) {
    return this.vetsService.createVetProfile(req.user.id, dto);
  }

  /**
   * PATCH /vets/me — actualizar perfil propio.
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async updateMyProfile(
    @Request() req,
    @Body() dto: UpdateVetProfileDto,
  ) {
    return this.vetsService.updateVetProfile(req.user.id, dto);
  }

  /**
   * POST /vets/me/availability/toggle — alternar "disponible ahora"
   * para el modo de servicios de emergencia.
   */
  @Post('me/availability/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async toggleMyAvailability(@Request() req) {
    return this.vetsService.toggleAvailability(req.user.id);
  }

  /**
   * GET /vets/me/earnings — resumen de ingresos del vet con agregaciones.
   */
  @Get('me/earnings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async getMyEarnings(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.vetsService.getMyEarnings(req.user.id, { startDate, endDate });
  }

  // ============================================================
  // VERIFICACIÓN PROFESIONAL (vet propio)
  // ============================================================

  /**
   * GET /vets/me/verification — estado de la verificación del vet.
   */
  @Get('me/verification')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async getMyVerificationStatus(@Request() req) {
    return this.verificationService.getVerificationStatus(req.user.id);
  }

  /**
   * POST /vets/me/verification/upload — subir un documento de verificación.
   *
   * Acepta `multipart/form-data` con:
   *  - file: archivo (jpg/png/pdf, máx 10 MB)
   *  - documentType, documentNumber?, issuedDate?, expiryDate?, issuedBy?
   */
  @Post('me/verification/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadVerificationDocument(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    if (!file) {
      throw new BadRequestException('El archivo es obligatorio');
    }
    return this.verificationService.uploadDocument(
      req.user.id,
      dto.documentType,
      file,
      {
        documentNumber: dto.documentNumber,
        issuedDate: dto.issuedDate,
        expiryDate: dto.expiryDate,
        issuedBy: dto.issuedBy,
      },
    );
  }

  /**
   * POST /vets/me/verification/submit — enviar verificación a revisión.
   * Requiere que todos los documentos obligatorios estén subidos.
   */
  @Post('me/verification/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.OK)
  async submitVerification(@Request() req) {
    return this.verificationService.submitForReview(req.user.id);
  }

  // ============================================================
  // GESTIÓN DE PRECIOS (vet propio)
  // ============================================================

  /**
   * GET /vets/me/prices — listado de precios propios.
   */
  @Get('me/prices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async getMyPrices(
    @Request() req,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.pricesService.getMyPrices(
      req.user.id,
      activeOnly === 'true',
    );
  }

  /**
   * POST /vets/me/prices — crear nuevo precio.
   */
  @Post('me/prices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  async createPrice(@Request() req, @Body() dto: CreatePriceDto) {
    return this.pricesService.createPrice(req.user.id, dto);
  }

  /**
   * POST /vets/me/prices/bulk — creación masiva (onboarding).
   */
  @Post('me/prices/bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  async bulkCreatePrices(
    @Request() req,
    @Body() dto: BulkCreatePricesDto,
  ) {
    return this.pricesService.bulkCreatePrices(req.user.id, dto.prices);
  }

  /**
   * PUT /vets/me/prices/:priceId — actualizar precio existente.
   */
  @Put('me/prices/:priceId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async updatePrice(
    @Request() req,
    @Param('priceId', ParseUUIDPipe) priceId: string,
    @Body() dto: UpdatePriceDto,
  ) {
    return this.pricesService.updatePrice(req.user.id, priceId, dto);
  }

  /**
   * DELETE /vets/me/prices/:priceId — eliminar precio (soft delete por defecto).
   */
  @Delete('me/prices/:priceId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePrice(
    @Request() req,
    @Param('priceId', ParseUUIDPipe) priceId: string,
    @Query('hard') hard?: string,
  ) {
    await this.pricesService.deletePrice(
      req.user.id,
      priceId,
      hard === 'true',
    );
  }

  /**
   * GET /vets/me/prices/stats — estadísticas de precios y límite del tier.
   */
  @Get('me/prices/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VET)
  async getMyPriceStats(@Request() req) {
    return this.pricesService.getPriceStats(req.user.id);
  }

  // ============================================================
  // ADMIN — Revisión de verificaciones
  // ============================================================

  /**
   * GET /vets/admin/verifications/pending — lista de verificaciones pendientes.
   */
  @Get('admin/verifications/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getPendingVerifications(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.verificationService.getPendingVerifications({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * POST /vets/admin/documents/:documentId/approve — aprobar documento.
   */
  @Post('admin/documents/:documentId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async approveDocument(
    @Request() req,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ApproveDocumentDto,
  ) {
    return this.verificationService.approveDocument(
      req.user.id,
      documentId,
      dto.notes,
    );
  }

  /**
   * POST /vets/admin/documents/:documentId/reject — rechazar documento.
   */
  @Post('admin/documents/:documentId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async rejectDocument(
    @Request() req,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.verificationService.rejectDocument(
      req.user.id,
      documentId,
      dto.reason,
    );
  }

  // ============================================================
  // ENDPOINTS PÚBLICOS POR ID (deben ir AL FINAL)
  // ============================================================

  /**
   * GET /vets/:id — detalles públicos de un veterinario.
   * Solo retorna vets verificados y activos. El propio vet puede ver su perfil incluso sin verificar.
   */
  @Get(':id')
  async getVetDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ) {
    const userId = req?.user?.id; // opcional (puede ser anónimo)
    return this.vetsService.getVetDetails(id, userId);
  }

  /**
   * GET /vets/:id/prices — precios públicos de un vet.
   */
  @Get(':id/prices')
  async getVetPrices(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricesService.getVetPrices(id, true);
  }
}
