import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Delete,
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
  StreamableFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { VerifiedVetGuard } from "../auth/guards/verified-vet.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { IdempotencyService } from "../common/security/idempotency.service";
import { PaymentMethod, UserRole } from "@prisma/client";

import { PaymentsService } from "./payments.service";
import { FinancialOperationsService } from "./financial-operations.service";
import {
  ProcessPaymentDto,
  VerifyTransferDto,
  InitiatePsePaymentDto,
  RequestWithdrawalDto,
  TransactionFiltersDto,
  WithdrawalListFiltersDto,
  RejectWithdrawalDto,
  MarkWithdrawalPaidDto,
  RunSettlementDto,
} from "./dto/payment.dto";

@Controller("payments")
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly financialOperations: FinancialOperationsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  private assertPseRailAvailable(): void {
    if (process.env.NODE_ENV === "production") {
      throw new ServiceUnavailableException(
        "PSE payments are unavailable until a production gateway adapter is certified end-to-end",
      );
    }
  }

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

    if (dto.paymentMethod === PaymentMethod.PSE) {
      this.assertPseRailAvailable();
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
  @UseGuards(RolesGuard, VerifiedVetGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  async verifyTransfer(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: VerifyTransferDto,
  ) {
    return this.financialOperations.submitTransferProof(
      req.user.id,
      id,
      file,
      dto,
    );
  }

  @Get("me/balance")
  async getMyBalance(@Request() req) {
    const base = await this.paymentsService.getBalance(
      req.user.id,
      req.user.role,
    );
    if (req.user.role !== UserRole.VET) return base;

    const financial = await this.financialOperations.getBalanceForUser(
      req.user.id,
    );
    return {
      ...base,
      copBalance: financial.availableCop,
      lifetimeLiquidatedCop: financial.earnedCop,
      reservedWithdrawalCop: financial.reservedCop,
      paidWithdrawalCop: financial.paidCop,
    };
  }

  @Get("transactions")
  async getTransactions(
    @Request() req,
    @Query() filters: TransactionFiltersDto,
  ) {
    return this.paymentsService.getTransactions(
      req.user.id,
      filters,
      req.user.role,
    );
  }

  @Get("transactions/:id")
  async getTransactionById(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.getTransactionById(
      req.user.id,
      id,
      req.user.role,
    );
  }

  @Post("pse/initiate")
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async initiatePse(
    @Request() req,
    @Body() dto: InitiatePsePaymentDto,
    @Headers("idempotency-key") headerKey?: string,
  ) {
    this.assertPseRailAvailable();

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
    return this.paymentsService.checkPseStatus(
      req.user.id,
      transactionId,
      req.user.role,
    );
  }

  @Get("ctg/rate")
  async getCtgRate() {
    return this.paymentsService.getCtgRate();
  }

  @Get("me/earnings")
  @UseGuards(RolesGuard, VerifiedVetGuard)
  @Roles(UserRole.VET)
  async getMyEarnings(
    @Request() req,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const [summary, financial] = await Promise.all([
      this.paymentsService.getEarningsSummary(req.user.id, {
        startDate,
        endDate,
      }),
      this.financialOperations.getBalanceForUser(req.user.id),
    ]);

    return {
      ...summary,
      availableBalance: financial.availableCop,
      reservedWithdrawals: financial.reservedCop,
      paidWithdrawals: financial.paidCop,
      lifetimeLiquidatedBalance: financial.earnedCop,
    };
  }

  @Post("withdrawals")
  @UseGuards(RolesGuard, VerifiedVetGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  async requestWithdrawal(
    @Request() req,
    @Body() dto: RequestWithdrawalDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const key = idempotencyKey?.trim();
    if (!key || key.length < 8 || key.length > 64) {
      throw new BadRequestException(
        "Idempotency-Key es obligatorio para retiros y debe tener entre 8 y 64 caracteres",
      );
    }

    const replay = await this.idempotencyService.execute({
      key: `payments:withdrawal:${req.user.id}:${key}`,
      endpoint: "POST /payments/withdrawals",
      userId: req.user.id,
      requestBody: dto,
      operation: async () => ({
        status: HttpStatus.CREATED,
        body: JSON.parse(
          JSON.stringify(
            await this.financialOperations.requestWithdrawal(req.user.id, dto),
          ),
        ),
      }),
    });
    return replay.result;
  }

  @Get("withdrawals")
  @UseGuards(RolesGuard, VerifiedVetGuard)
  @Roles(UserRole.VET)
  async listMyWithdrawals(
    @Request() req,
    @Query() filters: WithdrawalListFiltersDto,
  ) {
    return this.financialOperations.listMyWithdrawals(
      req.user.id,
      filters.limit ?? 20,
      filters.offset ?? 0,
    );
  }

  @Delete("withdrawals/:id")
  @UseGuards(RolesGuard, VerifiedVetGuard)
  @Roles(UserRole.VET)
  async cancelMyWithdrawal(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.financialOperations.cancelMyWithdrawal(req.user.id, id);
  }

  @Get("admin/transactions/:id/transfer-proof")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async readTransferProof(@Param("id", ParseUUIDPipe) id: string) {
    const proof = await this.financialOperations.readTransferProof(id);
    return new StreamableFile(proof.buffer, {
      type: proof.mimeType,
      disposition: `inline; filename="${proof.fileName}"`,
      length: proof.buffer.length,
    });
  }

  @Post("admin/transactions/:id/confirm-transfer")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async adminConfirmTransfer(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.financialOperations.confirmTransfer(req.user.id, id);
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
    return this.financialOperations.rejectTransfer(req.user.id, id, reason);
  }

  @Post("admin/settlements/run")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async runSettlement(
    @Request() req,
    @Body() dto: RunSettlementDto,
  ) {
    return this.financialOperations.runSettlementBatch(
      req.user.id,
      dto.holdDays ?? 7,
    );
  }

  @Get("admin/withdrawals")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async listAdminWithdrawals(@Query() filters: WithdrawalListFiltersDto) {
    return this.financialOperations.listAdminWithdrawals(
      filters.status,
      filters.limit ?? 50,
      filters.offset ?? 0,
    );
  }

  @Get("admin/withdrawals/:id/payout-instructions")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getPayoutInstructions(@Param("id", ParseUUIDPipe) id: string) {
    return this.financialOperations.getPayoutInstructions(id);
  }

  @Post("admin/withdrawals/:id/approve")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async approveWithdrawal(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.financialOperations.approveWithdrawal(req.user.id, id);
  }

  @Post("admin/withdrawals/:id/processing")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async markWithdrawalProcessing(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.financialOperations.markWithdrawalProcessing(req.user.id, id);
  }

  @Post("admin/withdrawals/:id/paid")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async markWithdrawalPaid(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: MarkWithdrawalPaidDto,
  ) {
    return this.financialOperations.markWithdrawalPaid(
      req.user.id,
      id,
      dto.paymentReference,
    );
  }

  @Post("admin/withdrawals/:id/reject")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async rejectWithdrawal(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RejectWithdrawalDto,
  ) {
    return this.financialOperations.rejectWithdrawal(
      req.user.id,
      id,
      dto.reason,
    );
  }
}
