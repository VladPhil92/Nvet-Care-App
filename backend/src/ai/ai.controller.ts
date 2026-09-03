import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { VerifiedVetGuard } from "../auth/guards/verified-vet.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { AiAssistService } from "./ai-assist.service";
import { ClientAiAssistDto, VetAiAssistDto } from "./dto/ai-assist.dto";

@Controller("ai")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly aiAssistService: AiAssistService) {}

  @Get("status")
  @Roles(UserRole.CLIENT, UserRole.VET)
  getStatus() {
    return this.aiAssistService.getStatus();
  }

  @Post("client-assist")
  @Roles(UserRole.CLIENT)
  clientAssist(@Request() req, @Body() dto: ClientAiAssistDto) {
    return this.aiAssistService.clientAssist(req.user.id, dto);
  }

  @Post("vet-assist")
  @UseGuards(VerifiedVetGuard)
  @Roles(UserRole.VET)
  vetAssist(@Request() req, @Body() dto: VetAiAssistDto) {
    return this.aiAssistService.vetAssist(req.user.id, dto);
  }
}
