import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuditAction, AuditSeverity, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { UpdateClientProfileDto } from "./dto/update-client-profile.dto";

const CLIENT_PROFILE_SELECT = {
  id: true,
  email: true,
  ctgUserId: true,
  role: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatar: true,
  emailVerified: true,
  twoFactorEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getClientProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: CLIENT_PROFILE_SELECT,
    });

    if (!user) throw new UnauthorizedException("Usuario no encontrado");
    return user;
  }

  async updateClientProfile(userId: string, dto: UpdateClientProfileDto) {
    const data: Prisma.UserUpdateInput = {};
    const changedFields: string[] = [];

    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName.trim();
      changedFields.push("firstName");
    }
    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName.trim();
      changedFields.push("lastName");
    }
    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      data.phone = phone.length > 0 ? phone : null;
      changedFields.push("phone");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: CLIENT_PROFILE_SELECT,
    });

    await this.auditService.log({
      actor: { id: userId },
      action: AuditAction.CONFIG_CHANGED,
      severity: AuditSeverity.INFO,
      targetType: "User",
      targetId: userId,
      reason: "client_profile_updated",
      // Only field names are recorded. Profile values remain out of audit
      // metadata to avoid duplicating personal data in the immutable log.
      metadata: { changedFields },
    });

    return user;
  }
}
