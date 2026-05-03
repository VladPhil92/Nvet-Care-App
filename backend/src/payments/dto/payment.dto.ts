import {
  IsUUID,
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
  Length,
  IsNotEmpty,
  IsObject,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod, TransactionStatus } from '@prisma/client';

// ============================================================
// PROCESS PAYMENT
// ============================================================

/**
 * DTO para procesar un pago de cita.
 * El método de pago determina el flujo subsiguiente:
 *  - CTG: descuento inmediato del balance del cliente
 *  - PSE: redirige a banco; webhook confirma
 *  - TRANSFER: queda PENDING hasta que el vet sube comprobante
 */
export class ProcessPaymentDto {
  @IsUUID('4')
  appointmentId: string;

  @IsEnum(PaymentMethod, {
    message: 'paymentMethod debe ser CTG, PSE o TRANSFER',
  })
  paymentMethod: PaymentMethod;

  @Type(() => Number)
  @IsNumber()
  @Min(5000, { message: 'El monto mínimo es 5.000 COP' })
  @Max(10_000_000, { message: 'El monto máximo es 10.000.000 COP' })
  amountCop: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountCtg?: number;

  /**
   * Idempotency key generada por el cliente para evitar pagos duplicados
   * en caso de retry de red. El servidor cachea el resultado por 24h.
   */
  @IsOptional()
  @IsString()
  @Length(8, 64)
  idempotencyKey?: string;
}

// ============================================================
// VERIFY TRANSFER
// ============================================================

export class VerifyTransferDto {
  /**
   * Código de referencia bancaria (Bancolombia, Davivienda, etc.)
   */
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

export type PseUserType = 'NATURAL' | 'JURIDICA';

export class InitiatePsePaymentDto {
  @IsUUID('4')
  appointmentId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(5000)
  @Max(10_000_000)
  amountCop: number;

  /**
   * Código del banco PSE (ACH Colombia: 1007=Bancolombia, 1051=Davivienda...)
   */
  @IsString()
  @IsNotEmpty()
  @Length(2, 10)
  bank: string;

  @IsString()
  @IsNotEmpty()
  userType: PseUserType;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  returnUrl?: string;
}

// ============================================================
// WITHDRAWAL
// ============================================================

export type WithdrawalMethod = 'BANK_TRANSFER' | 'NEQUI' | 'DAVIPLATA';

class AccountInfoDto {
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
  accountType?: 'SAVINGS' | 'CHECKING';

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
  @IsNumber()
  @Min(50000, { message: 'El retiro mínimo es 50.000 COP' })
  amountCop: number;

  @IsString()
  @IsNotEmpty()
  paymentMethod: WithdrawalMethod;

  @IsObject()
  @ValidateNested()
  @Type(() => AccountInfoDto)
  accountInfo: AccountInfoDto;
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
