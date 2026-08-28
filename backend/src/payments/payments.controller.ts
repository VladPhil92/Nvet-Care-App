import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ServiceUnavailableException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { IdempotencyService } from "../common/security/idempotency.service";
import { PaymentMethod, UserRole } from "@prisma/client";

import { PaymentsService } from "./payments.service";
import {
  ProcessPaymentDto,
  VerifyTransferDto,
  InitiatePsePaymentDto,
  RequestWithdrawalDto,
  TransactionFiltersDto,
} from "./dto/payment.dto";

@Controller("payments")
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * POST /payments/process
   *
   * La idempotencia persistente reemplaza la dependencia exclusiva del cache
   * en memoria del service. Funciona a través de reinicios y múltiples
   * instancias. CTG permanece cerrado mientras no exista un ledger de saldo
   * del cliente: confirmar una cita sin débito real sería un fallo financiero.
   */
  @Post("process")
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async processPayment(
    @Request() req,
    @Body() dto: ProcessPaymentDto,
    @Headers("idempotency-key") headerKey?: string,
  ) {
    if (dto.paymentMethod === PaymentMethod.CTG) {
      throw new ServiceUnavailableException(
        "CTG payments are temporarily unavailable until the client wallet ledger is enabled",
      );
    }

    const key = headerKey ?? dto.idempotencyKey;
    if (!key) {
      return this.paymentsService.processPayment(req.user.id, dto);
    }

    const replay = await this.idempotencyService.execute({
      key: `payments:process:${req.user.id}:${key}`,
      endpoint: "POST /payments/process",
      userId: req.user.id,
      requestBody: dto,
      operation: async () => {
        const transaction = await this.paymentsService.processPayment(
          req.user.id,
          dto,
        );
        return {
          status: HttpStatus.CREATED,
          body: JSON.parse(JSON.stringify(transaction)),
        };
      },
    });

    return replay.result;
  }

  @Post("transactions/:id/verify-transfer")
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  async verifyTransfer(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: VerifyTransferDto,
  ) {
    return this.paymentsService.verifyTransfer(req.user.id, id, file, dto);
  }

  @Get("me/balance")
  async getMyBalance(@Request() req) {
    return this.paymentsService.getBalance(req.user.id);
  }

  @Get("transactions")
  async getTransactions(
    @Request() req,
    @Query() filters: TransactionFiltersDto,
  ) {
    return this.paymentsService.getTransactions(req.user.id, filters);
  }

  @Get("transactions/:id")
  async getTransactionById(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.getTransactionById(req.user.id, id);
  }

  /**
   * PSE initiation is also replay-safe. The provider adapter is still sandbox
   * code in PaymentsService; production deployment must configure a real
   * gateway before exposing this method to end users.
   */
  @Post("pse/initiate")
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async initiatePse(
    @Request() req,
    @Body() dto: InitiatePsePaymentDto,
    @Headers("idempotency-key") headerKey?: string,
  ) {
    const key = headerKey ?? dto.idempotencyKey;
    if (!key) {
      return this.paymentsService.initiatePse(req.user.id, dto);
    }

    const replay = await this.idempotencyService.execute({
      key: `payments:pse:initiate:${req.user.id}:${key}`,
      endpoint: "POST /payments/pse/initiate",
      userId: req.user.id,
      requestBody: dto,
      operation: async () => {
        const result = await this.paymentsService.initiatePse(req.user.id, dto);
        return {
          status: HttpStatus.CREATED,
          body: JSON.parse(JSON.stringify(result)),
        };
      },
    });

    return replay.result;
  }

  @Get("pse/status/:transactionId")
  async checkPseStatus(
    @Request() req,
    @Param("transactionId", ParseUUIDPipe) transactionId: string,
  ) {
    return this.paymentsService.checkPseStatus(req.user.id, transactionId);
  }

  @Get("ctg/rate")
  async getCtgRate() {
    return this.paymentsService.getCtgRate();
  }

  @Get("me/earnings")
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  async getMyEarnings(
    @Request() req,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const [summary, balance] = await Promise.all([
      this.paymentsService.getEarningsSummary(req.user.id, {
        startDate,
        endDate,
      }),
      this.paymentsService.getBalance(req.user.id),
    ]);

    return {
      ...summary,
      pendingBalance: balance.pendingCop,
      availableBalance: balance.copBalance,
    };
  }

  @Post("withdrawals")
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  async requestWithdrawal(@Request() req, @Body() dto: RequestWithdrawalDto) {
    return this.paymentsService.requestWithdrawal(req.user.id, dto);
  }

  @Post("admin/transactions/:id/confirm-transfer")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async adminConfirmTransfer(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.adminConfirmTransfer(req.user.id, id);
  }

  @Post("admin/transactions/:id/reject-transfer")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async adminRejectTransfer(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body("reason") reason: string,
  ) {
    return this.paymentsService.adminRejectTransfer(req.user.id, id, reason);
  }
}
