import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from "class-validator";

export class MarkMessagesReadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  messageIds: string[];
}
