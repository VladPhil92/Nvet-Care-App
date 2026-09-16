import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  Length,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * DTO para crear un precio individual.
 *
 * serviceCode es opcional: enlaza el servicio a una sugerencia del catálogo
 * maestro de Nvet sin restringir el precio final fijado por el veterinario.
 */
export class CreatePriceDto {
  @IsOptional()
  @IsString()
  @Length(2, 64)
  serviceCode?: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  serviceName: string;

  @Type(() => Number)
  @IsNumber()
  @Min(5000)
  @Max(10_000_000)
  priceCop: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceCtg?: number;
}

/**
 * DTO para actualización parcial de un precio.
 */
export class UpdatePriceDto {
  @IsOptional()
  @IsString()
  @Length(2, 64)
  serviceCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  serviceName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(5000)
  @Max(10_000_000)
  priceCop?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceCtg?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO para creación masiva de precios (onboarding).
 */
export class BulkCreatePricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreatePriceDto)
  prices: CreatePriceDto[];
}
