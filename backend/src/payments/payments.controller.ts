import {
  Controller,
  Get,
  Post,
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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

import { PaymentsService } from './payments.service';
import {
  ProcessPaymentDto,
  VerifyTransferDto,
  InitiatePsePaymentDto,
  RequestWithdrawalDto,
  TransactionFiltersDto,
} from './dto/payment.dto';

/**
 * PaymentsController — todos los endpoints requieren autenticación.
 *
 * Convenciones:
 *  - `/payments/me/*`: el usuario autenticado actúa sobre sus propios recursos
 *  - `/payments/transactions/*`: lista o consulta de transacciones (con ownership check)
 *  - `/payments/admin/*`: acciones administrativas (rol ADMIN)
 *  - Webhooks PSE NO van aquí (son endpoints públicos sin JWT, se exponen en otro controller)
 */
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ============================================================
  // PROCESS PAYMENT (cliente paga su cita)
  // ============================================================

  /**
   * POST /payments/process — procesar pago de una cita.
   * Solo el cliente dueño de la cita puede iniciar el pago.
   */
  @Post('process')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async processPayment(@Request() req, @Body() dto: ProcessPaymentDto) {
    return this.paymentsService.processPayment(req.user.id, dto);
  }

  // ============================================================
  // VERIFY TRANSFER (vet sube comprobante)
  // ============================================================

  /**
   * POST /payments/transactions/:id/verify-transfer — vet sube comprobante de transferencia.
   * Acepta multipart/form-data con `file` (jpg/png/pdf máx 10 MB).
   */
  @Post('transactions/:id/verify-transfer')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async verifyTransfer(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: VerifyTransferDto,
  ) {
    return this.paymentsService.verifyTransfer(req.user.id, id, file, dto);
  }

  // ============================================================
  // BALANCE & TRANSACTIONS (usuario actual)
  // ============================================================

  /**
   * GET /payments/me/balance — saldo del usuario autenticado.
   */
  @Get('me/balance')
  async getMyBalance(@Request() req) {
    return this.paymentsService.getBalance(req.user.id);
  }

  /**
   * GET /payments/transactions — historial de transacciones del usuario.
   */
  @Get('transactions')
  async getTransactions(@Request() req, @Query() filters: TransactionFiltersDto) {
    return this.paymentsService.getTransactions(req.user.id, filters);
  }

  /**
   * GET /payments/transactions/:id — detalle de una transacción (con ownership check).
   */
  @Get('transactions/:id')
  async getTransactionById(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.getTransactionById(req.user.id, id);
  }

  // ============================================================
  // PSE
  // ============================================================

  /**
   * POST /payments/pse/initiate — iniciar pago PSE.
   * Retorna URL del banco para redirección.
   */
  @Post('pse/initiate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async initiatePse(@Request() req, @Body() dto: InitiatePsePaymentDto) {
    return this.paymentsService.initiatePse(req.user.id, dto);
  }

  /**
   * GET /payments/pse/status/:transactionId — verificar estado de pago PSE.
   */
  @Get('pse/status/:transactionId')
  async checkPseStatus(
    @Request() req,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    return this.paymentsService.checkPseStatus(req.user.id, transactionId);
  }

  // ============================================================
  // CTG TOKEN
  // ============================================================

  /**
   * GET /payments/ctg/rate — tasa de cambio CTG ↔ COP actual.
   */
  @Get('ctg/rate')
  async getCtgRate() {
    return this.paymentsService.getCtgRate();
  }

  // ============================================================
  // EARNINGS (vets)
  // ============================================================

  /**
   * GET /payments/me/earnings — resumen de ingresos (solo vets).
   */
  @Get('me/earnings')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  async getMyEarnings(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentsService.getEarningsSummary(req.user.id, {
      startDate,
      endDate,
    });
  }

  // ============================================================
  // WITHDRAWAL (vets)
  // ============================================================

  /**
   * POST /payments/withdrawals — solicitar retiro de saldo (solo vets).
   */
  @Post('withdrawals')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  async requestWithdrawal(@Request() req, @Body() dto: RequestWithdrawalDto) {
    return this.paymentsService.requestWithdrawal(req.user.id, dto);
  }

  // ============================================================
  // ADMIN
  // ============================================================

  /**
   * POST /payments/admin/transactions/:id/confirm-transfer — admin confirma transferencia.
   */
  @Post('admin/transactions/:id/confirm-transfer')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async adminConfirmTransfer(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.adminConfirmTransfer(req.user.id, id);
  }

  /**
   * POST /payments/admin/transactions/:id/reject-transfer — admin rechaza transferencia.
   */
  @Post('admin/transactions/:id/reject-transfer')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async adminRejectTransfer(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ) {
    return this.paymentsService.adminRejectTransfer(req.user.id, id, reason);
  }
}
