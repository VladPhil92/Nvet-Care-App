import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  IsUUID,
  Min,
  Matches,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateAppointmentDto {
  @IsUUID()
  vetId: string;

  @IsUUID()
  petId: string;

  @IsString()
  @IsNotEmpty()
  serviceType: string;

  @IsDateString()
  date: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'time debe estar en formato HH:mm',
  })
  time: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  amountCtg?: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsString()
  @IsOptional()
  notes?: string;
}
