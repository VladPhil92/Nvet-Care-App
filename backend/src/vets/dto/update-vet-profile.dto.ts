import {
  IsOptional,
  IsString,
  IsArray,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  Length,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para actualización parcial del perfil del veterinario autenticado.
 * Todos los campos son opcionales (PATCH semantics).
 */
export class UpdateVetProfileDto {
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  bio?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(70)
  yearsExperience?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  specialties?: string[];

  // ---------- Geolocalización ----------

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  department?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  serviceRadius?: number;

  // ---------- Disponibilidad ----------

  @IsOptional()
  @IsBoolean()
  isAvailableNow?: boolean;

  @IsOptional()
  @IsString()
  timezone?: string;
}
