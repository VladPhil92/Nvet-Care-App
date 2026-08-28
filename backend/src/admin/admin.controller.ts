import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "@prisma/client";

import { AdminService } from "./admin.service";
import {
  MetricsFiltersDto,
  AdminTransactionFiltersDto,
  ResolveDisputeDto,
  UpdateVetTierDto,
  ExportFiltersDto,
  AdminVetsFiltersDto,
  AdminAppointmentsFiltersDto,
} from "./dto/admin.dto";

/**
 * AdminController — todos los endpoints requieren JWT + role ADMIN.
 *
 * Organización:
 *  - GET   metrics + stats           → dashboard del admin
 *  - GET   transactions/appointments → listas filtradas y paginadas
 *  - PATCH vets/:id/tier             → cambio de tier
 *  - POST  transactions/:id/resolve  → resolver disputa
 *  - GET   exports/transactions      → descarga CSV
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ============================================================
  // METRICS & STATS
  // ============================================================

  /**
   * GET /admin/metrics — KPIs globales del dashboard.
   */
  @Get("metrics")
  async getMetrics(@Query() filters: MetricsFiltersDto) {
    return this.adminService.getMetrics(filters);
  }

  /**
   * GET /admin/payment-stats — distribución por método de pago.
   */
  @Get("payment-stats")
  async getPaymentMethodStats(@Query() filters: MetricsFiltersDto) {
    return this.adminService.getPaymentMethodStats(filters);
  }

  // ============================================================
  // TRANSACTIONS
  // ============================================================

  /**
   * GET /admin/transactions — listado de todas las transacciones.
   */
  @Get("transactions")
  async getTransactions(@Query() filters: AdminTransactionFiltersDto) {
    return this.adminService.getTransactions(filters);
  }

  /**
   * GET /admin/transfer-tracking — transferencias pendientes con tiempo en cola.
   */
  @Get("transfer-tracking")
  async getTransferTracking() {
    return this.adminService.getTransferTracking();
  }

  /**
   * POST /admin/transactions/:id/resolve-dispute — resolver disputa.
   */
  @Post("transactions/:id/resolve-dispute")
  @HttpCode(HttpStatus.OK)
  async resolveDispute(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.adminService.resolveDispute(
      req.user.id,
      id,
      dto,
      this.extractCtx(req),
    );
  }

  // ============================================================
  // APPOINTMENTS
  // ============================================================

  /**
   * GET /admin/appointments — listado global de citas.
   */
  @Get("appointments")
  async getAppointments(@Query() filters: AdminAppointmentsFiltersDto) {
    return this.adminService.getAppointments(filters);
  }

  // ============================================================
  // VETS
  // ============================================================

  /**
   * GET /admin/veterinarians — gestión de vets de la plataforma.
   */
  @Get("veterinarians")
  async getVeterinarians(@Query() filters: AdminVetsFiltersDto) {
    return this.adminService.getVeterinarians(filters);
  }

  /**
   * PATCH /admin/veterinarians/:id/tier — cambiar tier de un vet.
   */
  @Patch("veterinarians/:id/tier")
  async updateVetTier(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateVetTierDto,
  ) {
    return this.adminService.updateVetTier(
      req.user.id,
      id,
      dto,
      this.extractCtx(req),
    );
  }

  // ============================================================
  // EXPORTS
  // ============================================================

  /**
   * GET /admin/exports/transactions — descargar CSV de transacciones.
   *
   * Query params: format=CSV|XLSX, startDate, endDate, status, paymentMethod
   * Retorna: archivo descargable con headers Content-Disposition.
   */
  @Get("exports/transactions")
  async exportTransactions(
    @Request() req,
    @Query() filters: ExportFiltersDto,
    @Res({ passthrough: false }) res: Response,
  ) {
    const { filename, contentType, body } =
      await this.adminService.exportTransactions(
        filters,
        req.user.id,
        this.extractCtx(req),
      );

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");

    // BOM UTF-8 para que Excel detecte caracteres acentuados correctamente
    res.write("\uFEFF");
    res.end(body);
  }

  // ============================================================
  // INTERNAL
  // ============================================================

  private extractCtx(req: any): {
    ip?: string;
    userAgent?: string;
    role?: string;
  } {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress;
    return {
      ip,
      userAgent: req.headers["user-agent"],
      role: req.user?.role,
    };
  }
}
