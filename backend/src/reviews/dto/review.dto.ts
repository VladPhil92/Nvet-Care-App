import {
  IsInt,
  IsString,
  IsOptional,
  IsUUID,
  Min,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReviewDto {
  @IsUUID()
  appointmentId: string;

  /**
   * Rating del 1 al 5 estrellas.
   * Validado aquí y en DB (no existen ratings fuera de rango).
   */
  @IsInt()
  @Min(1, { message: 'El rating mínimo es 1 estrella' })
  @Max(5, { message: 'El rating máximo es 5 estrellas' })
  @Type(() => Number)
  rating: number;

  /**
   * Comentario opcional. Mínimo 10 chars para forzar feedback útil.
   * Máximo 1000 chars para evitar abuso.
   */
  @IsString()
  @IsOptional()
  @MinLength(10, { message: 'El comentario debe tener al menos 10 caracteres' })
  @MaxLength(1000, { message: 'El comentario no puede superar los 1000 caracteres' })
  comment?: string;
}

export class UpdateReviewDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating?: number;

  @IsString()
  @IsOptional()
  @MinLength(10)
  @MaxLength(1000)
  comment?: string;
}

export class VetReviewsFilterDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  /** Filtrar por rating mínimo (ej. solo 4 y 5 estrellas) */
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  minRating?: number;
}
