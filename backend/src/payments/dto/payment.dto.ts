import {
  IsUUID,
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  Length,
  IsNotEmpty,
  IsObject,
  ValidateNested,
  IsDateString,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";
import { PaymentMethod, TransactionStatus } from "@prisma/client";

// ============================================================
// PROCESS PAYMENT
// ============================================================

export class ProcessPaymentDto {
  @IsUUID("4")
  appointmentId: string;

  @IsEnum(PaymentMethod, {
    message: "paymentMethod debe ser CTG, PSE o TRANSFER",
  })
  paymentMethod: PaymentMethod;

  @Type(() => Number)
  @IsNumber()
  @Min(5000, { message: "El monto mínimo es 5.000 COP" })
  @Max(10_000_000, { message: "El monto máximo es 10.000.000 COP" })
  amountCop: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountCtg?: number;

  @IsOptional()
  @IsString()
  @Length(8, 64)
  idempotencyKey?: string;
}

// ============================================================
// VERIFY TRANSFER
// ============================================================

export class VerifyTransferDto {
  @IsString()
  @IsNotEmpty()
  @Length(4, 50)
  transferCode: string;

  @IsOptional()
  @IsDateString()
  transferDate?: string;
}

// ============================================================
// PSE
// ============================================================

export type PseUserType = "NATURAL" | "JURIDICA";

export class InitiatePsePaymentDto {
  @IsUUID("4")
  appointmentId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(5000)
  @Max(10_000_000)
  amountCop: number;

  @IsString()
  @IsNotEmpty()
  @Length(2, 10)
  bank: string;

  @IsString()
  @IsIn(["NATURAL", "JURIDICA"])
  userType: PseUserType;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  returnUrl?: string;

  @IsOptional()
  @IsString()
  @Length(8, 64)
  idempotencyKey?: string;
}

// ============================================================
// WITHDRAWAL
// ============================================================

export type WithdrawalMethod = "BANK_TRANSFER" | "NEQUI" | "DAVIPLATA";

export class AccountInfoDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  bankName?: string;

  @IsOptional()
  @IsString()
  @Length(4, 30)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @IsIn(["SAVINGS", "CHECKING"])
  accountType?: "SAVINGS" | "CHECKING";

  @IsOptional()
  @IsString()
  @Length(7, 15)
  phoneNumber?: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 20)
  documentId: string;
}

export class RequestWithdrawalDto {
  @Type(() => Number)
  @IsInt({ message: "El retiro debe expresarse en pesos colombianos enteros" })
  @Min(50000, { message: "El retiro mínimo es 50.000 COP" })
  @Max(50_000_000, {
    message: "El retiro máximo por solicitud es 50.000.000 COP",
  })
  amountCop: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(["BANK_TRANSFER", "NEQUI", "DAVIPLATA"])
  paymentMethod: WithdrawalMethod;

  @IsObject()
  @ValidateNested()
  @Type(() => AccountInfoDto)
  accountInfo: AccountInfoDto;
}

export class WithdrawalListFiltersDto {
  @IsOptional()
  @IsString()
  @IsIn(["PENDING", "APPROVED", "PROCESSING", "PAID", "REJECTED", "CANCELLED"])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class RejectWithdrawalDto {
  @IsString()
  @Length(10, 500)
  reason: string;
}

export class MarkWithdrawalPaidDto {
  @IsString()
  @Length(6, 120)
  paymentReference: string;
}

export class RunSettlementDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  holdDays?: number;
}

// ============================================================
// FILTERS
// ============================================================

export class TransactionFiltersDto {
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;
}
