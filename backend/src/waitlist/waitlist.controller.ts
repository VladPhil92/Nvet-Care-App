import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { IsEmail } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { WaitlistService } from "./waitlist.service";

class WaitlistDto {
  @IsEmail()
  email: string;
}

@Controller("waitlist")
export class WaitlistController {
  constructor(private waitlist: WaitlistService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async join(@Body() dto: WaitlistDto) {
    await this.waitlist.join(dto.email);
    // Always return the same message — don't reveal whether email was already registered
    return {
      success: true,
      message: "Te avisaremos cuando la tienda esté disponible.",
    };
  }
}
