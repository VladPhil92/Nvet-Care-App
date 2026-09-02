import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiAssistService } from "./ai-assist.service";
import { AiProviderService } from "./ai-provider.service";

@Module({
  controllers: [AiController],
  providers: [AiAssistService, AiProviderService],
  exports: [AiAssistService],
})
export class AiModule {}
