import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class WaitlistService {
  constructor(private prisma: PrismaService) {}

  async join(
    email: string,
    source = "store",
  ): Promise<{ alreadyRegistered: boolean }> {
    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { email },
    });

    if (existing) {
      return { alreadyRegistered: true };
    }

    await this.prisma.waitlistEntry.create({
      data: { email, source },
    });

    return { alreadyRegistered: false };
  }
}
