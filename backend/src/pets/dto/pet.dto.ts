import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Especies soportadas. Texto libre si el usuario elige OTHER.
 */
export enum PetSpeciesEnum {
  DOG = 'DOG',
  CAT = 'CAT',
  BIRD = 'BIRD',
  RABBIT = 'RABBIT',
  REPTILE = 'REPTILE',
  FISH = 'FISH',
  OTHER = 'OTHER',
}

export class CreatePetDto {
  @IsString()
  @MinLength(1, { message: 'El nombre de la mascota es obligatorio' })
  @MaxLength(50, { message: 'El nombre no puede superar 50 caracteres' })
  name: string;

  /**
   * Almacenado como string en DB para flexibilidad futura.
   * Se valida contra el enum antes de persistir.
   */
  @IsString()
  @IsEnum(PetSpeciesEnum, {
    message: `La especie debe ser una de: ${Object.values(PetSpeciesEnum).join(', ')}`,
  })
  species: string;

  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'La raza no puede superar 100 caracteres' })
  breed?: string;

  /** Peso en kilogramos. Máx 999 kg para cubrir caballos/bovinos en contextos exóticos. */
  @IsNumber()
  @IsOptional()
  @Min(0.01, { message: 'El peso mínimo es 0.01 kg' })
  @Max(999, { message: 'El peso máximo es 999 kg' })
  @Type(() => Number)
  weight?: number;

  /** Fecha de nacimiento en formato ISO8601. No puede ser futura. */
  @IsDateString({}, { message: 'La fecha de nacimiento debe ser una fecha válida' })
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Las notas no pueden superar 500 caracteres' })
  notes?: string;
}

export class UpdatePetDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsString()
  @IsOptional()
  @IsEnum(PetSpeciesEnum)
  species?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  breed?: string;

  @IsNumber()
  @IsOptional()
  @Min(0.01)
  @Max(999)
  @Type(() => Number)
  weight?: number;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
