import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { UserRole, VerificationStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

interface RegistryRow {
  status: string;
}

@Injectable()
export class VerifiedVetGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    if (!user?.id || user.role !== UserRole.VET) {
      throw new ForbiddenException({
        code: "VERIFIED_VET_REQUIRED",
        message: "Esta operación requiere un veterinario verificado.",
      });
    }

    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        isVerified: true,
        isActive: true,
        verificationStatus: true,
      },
    });

    if (!vet) {
      throw new ForbiddenException({
        code: "VERIFIED_VET_REQUIRED",
        message: "No existe un perfil veterinario asociado a esta cuenta.",
      });
    }

    const registryRows = await this.prisma.$queryRawUnsafe<RegistryRow[]>(
      `SELECT status
         FROM "vet_professional_registry_checks"
        WHERE "vet_profile_id" = $1
        LIMIT 1`,
      vet.id,
    );
    const registryVerified = registryRows?.[0]?.status === "VERIFIED";

    const operational =
      vet.isVerified &&
      vet.isActive &&
      vet.verificationStatus === VerificationStatus.APPROVED &&
      registryVerified;

    if (!operational) {
      throw new ForbiddenException({
        code: "VERIFIED_VET_REQUIRED",
        message:
          "Completa la revisión documental y la verificación del registro profesional antes de operar.",
      });
    }

    request.user.vetProfileId = vet.id;
    request.user.professionalRegistryVerified = true;
    return true;
  }
}
