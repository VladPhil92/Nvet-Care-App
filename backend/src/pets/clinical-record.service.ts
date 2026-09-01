import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type JsonObject = Record<string, unknown>;

@Injectable()
export class ClinicalRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async getClientRecord(ownerId: string, petId: string) {
    const pet = await this.prisma.pet.findUnique({
      where: { id: petId },
      select: {
        id: true,
        ownerId: true,
        name: true,
        species: true,
        breed: true,
        weight: true,
        birthDate: true,
        photo: true,
        healthProfile: true,
        healthProfileVersion: true,
        healthProfileUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!pet) {
      throw new NotFoundException("Mascota no encontrada");
    }
    if (pet.ownerId !== ownerId) {
      throw new ForbiddenException(
        "Solo el dueño puede consultar este expediente clínico",
      );
    }

    const completedAppointments = await this.prisma.appointment.findMany({
      where: {
        petId,
        clientId: ownerId,
        completedAt: { not: null },
      },
      select: {
        id: true,
        serviceType: true,
        date: true,
        time: true,
        diagnosis: true,
        treatment: true,
        completedAt: true,
        updatedAt: true,
        vet: {
          select: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: [{ date: "desc" }, { time: "desc" }],
    });

    const ownerReported = this.ownerReportedProfile(pet.healthProfile);
    const records = completedAppointments.map((appointment) => {
      const diagnosis = this.cleanText(appointment.diagnosis);
      const treatment = this.cleanText(appointment.treatment);
      const vetName = [
        appointment.vet.user.firstName,
        appointment.vet.user.lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      return {
        appointmentId: appointment.id,
        source: "VET_AUTHORED" as const,
        serviceType: appointment.serviceType,
        date: appointment.date,
        time: appointment.time,
        completedAt: appointment.completedAt,
        lastUpdatedAt: appointment.updatedAt,
        veterinarian: {
          name: vetName || "Veterinario Nvet Care",
        },
        diagnosis,
        treatment,
        hasClinicalNote: Boolean(diagnosis || treatment),
      };
    });

    return {
      schemaVersion: 3,
      generatedAt: new Date().toISOString(),
      pet: {
        id: pet.id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        weight: pet.weight,
        birthDate: pet.birthDate,
        photo: pet.photo,
        createdAt: pet.createdAt,
        updatedAt: pet.updatedAt,
      },
      ownerReported: {
        source: "OWNER_REPORTED" as const,
        schemaVersion: pet.healthProfileVersion,
        updatedAt: pet.healthProfileUpdatedAt,
        available: ownerReported !== null,
        data: ownerReported,
      },
      vetAuthored: {
        source: "VET_AUTHORED" as const,
        records,
      },
      summary: {
        completedAttendances: records.length,
        documentedAttendances: records.filter(
          (record) => record.hasClinicalNote,
        ).length,
        ownerReportedProfileAvailable: ownerReported !== null,
      },
      provenance: {
        ownerReported:
          "Datos declarados por el responsable de la mascota; no equivalen a una conclusión clínica veterinaria.",
        vetAuthored:
          "Diagnósticos y tratamientos persistidos en atenciones que alcanzaron estado completado; el expediente conserva esa evidencia aunque la cita entre después en disputa.",
      },
    };
  }

  private ownerReportedProfile(value: unknown): JsonObject | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const profile = value as JsonObject;
    if (profile.schemaVersion !== 1 || profile.source !== "OWNER_REPORTED") {
      return null;
    }

    return profile;
  }

  private cleanText(value: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
