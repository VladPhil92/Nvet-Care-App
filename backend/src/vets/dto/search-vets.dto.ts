import {
  IsOptional,
  IsNumber,
  IsString,
  IsBoolean,
  IsEnum,
  IsDateString,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { VetTier } from '@prisma/client';

/**
 * DTO para búsqueda avanzada de veterinarios.
 *
 * Soporta:
 * - Geolocalización con radio (Haversine en service)
 * - Filtros por tier, especialidad, rating, ciudad
 * - Disponibilidad inmediata o en fecha específica
 * - Búsqueda full-text en bio/nombre
 * - Paginación + ordenamiento configurable
 */

export type SortBy =
  | 'relevance'
  | 'rating'
  | 'distance'
  | 'price_asc'
  | 'price_desc'
  | 'experience';

export class SearchVetsDto {
  // ---------- Geolocalización ----------

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'latitude debe ser numérico' })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'longitude debe ser numérico' })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  radiusKm?: number;

  // ---------- Filtros ----------

  @IsOptional()
  @IsString()
  @Length(2, 60)
  specialty?: string;

  @IsOptional()
  @IsEnum(VetTier)
  tier?: VetTier;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  availableNow?: boolean;

  @IsOptional()
  @IsDateString()
  availableDate?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  search?: string;

  // ---------- Paginación ----------

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

  // ---------- Ordenamiento ----------

  @IsOptional()
  @IsString()
  sortBy?: SortBy;
}
