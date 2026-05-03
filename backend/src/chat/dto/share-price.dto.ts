import {
  IsObject,
  ValidateNested,
  IsString,
  IsNumber,
  IsOptional,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

class PriceDataDto {
  @IsString()
  @IsNotEmpty()
  serviceName: string;

  @IsNumber()
  @Min(0)
  priceCop: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  priceCtg?: number;
}

export class SharePriceDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PriceDataDto)
  priceData: PriceDataDto;
}
