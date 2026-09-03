import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiAssistService } from "./ai-assist.service";
import { AiProviderService } from "./ai-provider.service";
import { AiSafetyPolicyService } from "./ai-safety-policy.service";

@Module({
  controllers: [AiController],
  providers: [AiAssistService, AiProviderService, AiSafetyPolicyService],
  exports: [AiAssistService],
})
export class AiModule {}
