import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuditAction, AuditSeverity, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { UpdateClientProfileDto } from "./dto/update-client-profile.dto";

const CLIENT_PROFILE_SELECT = {
  id: true,
  email: true,
  ctgUserId: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatar: true,
  emailVerified: true,
  twoFactorEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type ClientProfileRow = Prisma.UserGetPayload<{
  select: typeof CLIENT_PROFILE_SELECT;
}>;

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
    return this.toPublicProfile(user);
  }

  async updateClientProfile(userId: string, dto: UpdateClientProfileDto) {
    const data: Prisma.UserUpdateInput = {};
    const changedFields: string[] = [];

    if (dto.firstName !== undefined) {
      const firstName = dto.firstName.trim();
      if (firstName.length < 2) {
        throw new BadRequestException("El nombre debe tener mínimo 2 caracteres");
      }
      data.firstName = firstName;
      changedFields.push("firstName");
    }
    if (dto.lastName !== undefined) {
      const lastName = dto.lastName.trim();
      if (lastName.length < 2) {
        throw new BadRequestException(
          "El apellido debe tener mínimo 2 caracteres",
        );
      }
      data.lastName = lastName;
      changedFields.push("lastName");
    }
    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      data.phone = phone.length > 0 ? phone : null;
      changedFields.push("phone");
    }

    if (changedFields.length === 0) {
      throw new BadRequestException("No hay cambios de perfil para guardar");
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

    return this.toPublicProfile(user);
  }

  private toPublicProfile(user: ClientProfileRow) {
    const { ctgUserId, ...profile } = user;
    return {
      ...profile,
      identitySource: ctgUserId ? "CTG_ONE" : "NVET_LOCAL",
    };
  }
}
