import {
  IsString,
  IsOptional,
  IsDateString,
  Matches,
} from 'class-validator';

export class UpdateAppointmentDto {
  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'time debe estar en formato HH:mm',
  })
  @IsOptional()
  time?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
