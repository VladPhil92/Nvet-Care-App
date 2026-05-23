import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsEmail } from 'class-validator';
import { Throttle } from '@nestjs/throttler';

class WaitlistDto {
  @IsEmail()
  email: string;
}

@Controller('waitlist')
export class WaitlistController {
  constructor(private prisma: PrismaService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async join(@Body() dto: WaitlistDto) {
    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      // Return success silently — don't reveal whether email is already registered
      return { success: true, message: 'Te avisaremos cuando la tienda esté disponible.' };
    }

    await this.prisma.waitlistEntry.create({
      data: { email: dto.email, source: 'store' },
    });

    return { success: true, message: 'Te avisaremos cuando la tienda esté disponible.' };
  }
}
