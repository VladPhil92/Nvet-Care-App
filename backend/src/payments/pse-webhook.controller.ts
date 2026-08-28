import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, Throttle, seconds } from "@nestjs/throttler";
import { PseWebhookGuard } from "./guards/pse-webhook.guard";
import type { PseWebhookPayload } from "./payments.service";
import { PseSettlementService } from "./pse-settlement.service";

@Controller("webhooks/pse")
export class PseWebhookController {
  private readonly logger = new Logger(PseWebhookController.name);

  constructor(private readonly pseSettlementService: PseSettlementService) {}

  @Post()
  @UseGuards(PseWebhookGuard)
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async handlePseWebhook(@Body() payload: PseWebhookPayload) {
    this.logger.log(
      `PSE webhook recibido: txId=${payload.transactionId} status=${payload.status}`,
    );

    await this.pseSettlementService.handle(payload);

    return { received: true };
  }

  @Post("ping")
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async pingWebhook() {
    return { ok: true, ts: new Date().toISOString() };
  }
}
