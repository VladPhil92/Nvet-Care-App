import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { VerificationStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  ProfessionalRegistryCheckStatus,
  RecordProfessionalRegistryCheckDto,
} from "./dto/professional-registry.dto";

interface RegistryCheckRow {
  id: string;
  vet_profile_id: string;
  status: ProfessionalRegistryCheckStatus;
  checked_by: string | null;
  evidence: string;
  source_url: string;
  checked_at: Date;
  created_at: Date;
  updated_at: Date;
}

const OFFICIAL_REGISTRY_URL =
  "https://consejoprofesionalmvz.gov.co/consulta-de-profesionales/";

@Injectable()
export class ProfessionalRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        licenseNumber: true,
        comvezcolNumber: true,
        verificationStatus: true,
        isVerified: true,
        isActive: true,
      },
    });

    if (!vet) {
      throw new NotFoundException("Vet profile not found");
    }

    return this.buildStatus(vet);
  }

  async getForVetProfile(vetProfileId: string) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { id: vetProfileId },
      select: {
        id: true,
        licenseNumber: true,
        comvezcolNumber: true,
        verificationStatus: true,
        isVerified: true,
        isActive: true,
      },
    });

    if (!vet) {
      throw new NotFoundException("Vet profile not found");
    }

    return this.buildStatus(vet);
  }

  async recordCheck(
    adminUserId: string,
    vetProfileId: string,
    dto: RecordProfessionalRegistryCheckDto,
  ) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { id: vetProfileId },
      select: {
        id: true,
        comvezcolNumber: true,
        verificationStatus: true,
        isVerified: true,
      },
    });

    if (!vet) {
      throw new NotFoundException("Vet profile not found");
    }

    if (
      dto.status === ProfessionalRegistryCheckStatus.VERIFIED &&
      !vet.comvezcolNumber
    ) {
      throw new BadRequestException(
        "No se puede certificar el registro profesional sin número COMVEZCOL en el perfil.",
      );
    }

    const evidence = dto.evidence.trim();
    if (evidence.length < 10) {
      throw new BadRequestException(
        "La evidencia del chequeo oficial debe tener al menos 10 caracteres.",
      );
    }

    const checkId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "vet_professional_registry_checks"
        ("id", "vet_profile_id", "status", "checked_by", "evidence", "source_url", "checked_at", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("vet_profile_id") DO UPDATE SET
         "status" = EXCLUDED."status",
         "checked_by" = EXCLUDED."checked_by",
         "evidence" = EXCLUDED."evidence",
         "source_url" = EXCLUDED."source_url",
         "checked_at" = CURRENT_TIMESTAMP,
         "updated_at" = CURRENT_TIMESTAMP`,
      checkId,
      vetProfileId,
      dto.status,
      adminUserId,
      evidence,
      OFFICIAL_REGISTRY_URL,
    );

    const canActivate =
      dto.status === ProfessionalRegistryCheckStatus.VERIFIED &&
      vet.isVerified &&
      vet.verificationStatus === VerificationStatus.APPROVED;

    await this.prisma.vetProfile.update({
      where: { id: vetProfileId },
      data: {
        isActive: canActivate,
        isAvailableNow: false,
      },
    });

    return this.getForVetProfile(vetProfileId);
  }

  private async buildStatus(vet: {
    id: string;
    licenseNumber: string;
    comvezcolNumber: string | null;
    verificationStatus: VerificationStatus;
    isVerified: boolean;
    isActive: boolean;
  }) {
    const rows = await this.prisma.$queryRawUnsafe<RegistryCheckRow[]>(
      `SELECT "id", "vet_profile_id", "status", "checked_by", "evidence", "source_url",
              "checked_at", "created_at", "updated_at"
         FROM "vet_professional_registry_checks"
        WHERE "vet_profile_id" = $1
        LIMIT 1`,
      vet.id,
    );

    const check = rows[0] ?? null;
    const registryVerified =
      check?.status === ProfessionalRegistryCheckStatus.VERIFIED;
    const canOperate =
      vet.isVerified &&
      vet.isActive &&
      vet.verificationStatus === VerificationStatus.APPROVED &&
      registryVerified;

    return {
      vetProfileId: vet.id,
      licenseNumber: vet.licenseNumber,
      comvezcolNumber: vet.comvezcolNumber,
      documentaryVerificationStatus: vet.verificationStatus,
      isDocumentVerified: vet.isVerified,
      registry: check
        ? {
            status: check.status,
            checkedAt: check.checked_at,
            evidence: check.evidence,
            sourceUrl: check.source_url,
          }
        : {
            status: "PENDING",
            checkedAt: null,
            evidence: null,
            sourceUrl: OFFICIAL_REGISTRY_URL,
          },
      canOperate,
      method: "MANUAL_OFFICIAL_REGISTRY",
    };
  }
}
