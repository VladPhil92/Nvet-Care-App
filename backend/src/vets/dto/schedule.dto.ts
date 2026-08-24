import { IsDateString } from 'class-validator';

export class GetVetScheduleQueryDto {
  @IsDateString({}, { message: 'date debe estar en formato ISO YYYY-MM-DD' })
  date: string;
}
