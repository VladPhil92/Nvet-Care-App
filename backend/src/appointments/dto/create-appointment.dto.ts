import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  IsUUID,
  Min,
  Max,
  Matches,
} from "class-validator";
import { Type } from "class-transformer";
import { PaymentMethod } from "@prisma/client";

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
    message: "time debe estar en formato HH:mm",
  })
  time: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  /**
   * Device/service-point coordinates used only to validate market coverage and
   * the selected veterinarian's radius. They are intentionally optional at the
   * DTO layer for backwards compatibility; production coverage enforcement
   * fails closed when they are absent.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  serviceLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  serviceLongitude?: number;

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
