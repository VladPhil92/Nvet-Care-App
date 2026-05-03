import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AddClinicalNotesDto {
  @IsString()
  @IsNotEmpty()
  diagnosis: string;

  @IsString()
  @IsOptional()
  treatment?: string;
}
