import {
  IsDateString,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

export class GetVetScheduleQueryDto {
  @IsDateString({}, { message: "date debe estar en formato ISO YYYY-MM-DD" })
  date: string;
}

export class GetScheduleExceptionsQueryDto {
  @IsDateString(
    {},
    { message: "startDate debe estar en formato ISO YYYY-MM-DD" },
  )
  startDate: string;

  @IsDateString({}, { message: "endDate debe estar en formato ISO YYYY-MM-DD" })
  endDate: string;
}

export class UpsertScheduleExceptionDto {
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, {
    message: "startTime debe estar en formato HH:mm",
  })
  startTime?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: "endTime debe estar en formato HH:mm" })
  endTime?: string;
}
