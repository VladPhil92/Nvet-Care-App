import { IsString, IsNotEmpty, MinLength, MaxLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}
