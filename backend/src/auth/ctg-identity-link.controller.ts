import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle, seconds } from "@nestjs/throttler";

import { CtgIdentityLinkDto } from "./dto/ctg-identity-link.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CtgIdentityLinkService } from "./services/ctg-identity-link.service";

@Controller("auth")
export class CtgIdentityLinkController {
  constructor(private readonly linkService: CtgIdentityLinkService) {}

  /**
   * Link the authenticated Nvet account to a verified CTG One identity.
   * Both credentials are required: the JwtAuthGuard proves control of Nvet,
   * while the Supabase access token proves control of CTG One.
   */
  @Post("ctg-identity/link")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  @HttpCode(HttpStatus.OK)
  async link(@Req() req: any, @Body() dto: CtgIdentityLinkDto) {
    const ipAddress =
      (req.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress;
    const userAgent = req.headers?.["user-agent"];

    return this.linkService.link(req.user.id, dto.supabaseAccessToken, {
      ipAddress,
      userAgent,
    });
  }
}
