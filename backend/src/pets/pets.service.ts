import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePetDto, UpdatePetDto } from "./dto/pet.dto";
import { UpdatePetHealthProfileDto } from "./dto/pet-health-profile.dto";

/**
 * PetsService — CRUD de mascotas del sistema Nvet Care.
 *
 * Reglas:
 *  - Solo el dueño puede ver, editar o eliminar su mascota.
 *  - Un vet con una cita puede consultar la mascota (GET by ID).
 *  - El perfil preventivo V2 es información reportada por el dueño y se
 *    mantiene separado del diagnóstico/tratamiento firmado por el vet.
 *  - La fecha de nacimiento no puede ser futura.
 */
@Injectable()
export class PetsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // GET — mascotas del dueño autenticado
  // ============================================================

  async getMyPets(ownerId: string) {
    return this.prisma.pet.findMany({
      where: { ownerId },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ============================================================
  // GET — detalle de mascota (dueño o vet con cita)
  // ============================================================

  async getPetById(requesterId: string, petId: string) {
    const pet = await this.prisma.pet.findUnique({
      where: { id: petId },
      include: {
        appointments: {
          select: {
            id: true,
            status: true,
            date: true,
            serviceType: true,
          },
          orderBy: { date: "desc" },
          take: 5,
        },
      },
    });

    if (!pet) throw new NotFoundException("Mascota no encontrada");

    if (pet.ownerId === requesterId) return pet;

    const hasAppointment = await this.prisma.appointment.findFirst({
      where: {
        petId,
        vet: { userId: requesterId },
      },
    });

    if (!hasAppointment) {
      throw new ForbiddenException("No tienes acceso a esta mascota");
    }

    return pet;
  }

  // ============================================================
  // CREATE
  // ============================================================

  async createPet(ownerId: string, dto: CreatePetDto) {
    if (dto.birthDate && new Date(dto.birthDate) > new Date()) {
      throw new BadRequestException(
        "La fecha de nacimiento no puede ser futura",
      );
    }

    return this.prisma.pet.create({
      data: {
        ownerId,
        name: dto.name.trim(),
        species: dto.species,
        breed: dto.breed?.trim(),
        weight: dto.weight,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        notes: dto.notes?.trim(),
      },
    });
  }

  // ============================================================
  // UPDATE BASE PROFILE
  // ============================================================

  async updatePet(ownerId: string, petId: string, dto: UpdatePetDto) {
    const pet = await this.requireOwner(ownerId, petId);

    if (dto.birthDate && new Date(dto.birthDate) > new Date()) {
      throw new BadRequestException(
        "La fecha de nacimiento no puede ser futura",
      );
    }

    return this.prisma.pet.update({
      where: { id: pet.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.species !== undefined && { species: dto.species }),
        ...(dto.breed !== undefined && { breed: dto.breed.trim() }),
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.birthDate !== undefined && {
          birthDate: new Date(dto.birthDate),
        }),
        ...(dto.notes !== undefined && { notes: dto.notes.trim() }),
      },
    });
  }

  // ============================================================
  // PET HEALTH RECORD V2 — owner-reported preventive profile
  // ============================================================

  async updateHealthProfile(
    ownerId: string,
    petId: string,
    dto: UpdatePetHealthProfileDto,
  ) {
    const pet = await this.requireOwner(ownerId, petId);
    this.validateHealthTimeline(dto);

    const clean = (value?: string) => value?.trim() || undefined;
    const healthProfile = {
      schemaVersion: 1,
      source: "OWNER_REPORTED",
      allergies: dto.allergies.map((item) => ({
        id: item.id,
        substance: item.substance.trim(),
        severity: item.severity,
        ...(clean(item.reaction) ? { reaction: clean(item.reaction) } : {}),
        ...(item.notedAt ? { notedAt: item.notedAt } : {}),
      })),
      medications: dto.medications.map((item) => ({
        id: item.id,
        name: item.name.trim(),
        active: item.active,
        ...(clean(item.dosage) ? { dosage: clean(item.dosage) } : {}),
        ...(clean(item.frequency) ? { frequency: clean(item.frequency) } : {}),
        ...(item.startedAt ? { startedAt: item.startedAt } : {}),
        ...(item.endedAt ? { endedAt: item.endedAt } : {}),
        ...(clean(item.notes) ? { notes: clean(item.notes) } : {}),
      })),
      conditions: dto.conditions.map((item) => ({
        id: item.id,
        name: item.name.trim(),
        status: item.status,
        ...(item.diagnosedAt ? { diagnosedAt: item.diagnosedAt } : {}),
        ...(clean(item.notes) ? { notes: clean(item.notes) } : {}),
      })),
      vaccinations: dto.vaccinations.map((item) => ({
        id: item.id,
        vaccine: item.vaccine.trim(),
        administeredAt: item.administeredAt,
        ...(item.nextDueAt ? { nextDueAt: item.nextDueAt } : {}),
        ...(clean(item.batch) ? { batch: clean(item.batch) } : {}),
        ...(clean(item.provider) ? { provider: clean(item.provider) } : {}),
      })),
      deworming: dto.deworming.map((item) => ({
        id: item.id,
        product: item.product.trim(),
        administeredAt: item.administeredAt,
        ...(item.nextDueAt ? { nextDueAt: item.nextDueAt } : {}),
        ...(clean(item.notes) ? { notes: clean(item.notes) } : {}),
      })),
      preventiveCare: dto.preventiveCare.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title.trim(),
        dueAt: item.dueAt,
        status: item.status,
        ...(clean(item.notes) ? { notes: clean(item.notes) } : {}),
      })),
    };

    return this.prisma.pet.update({
      where: { id: pet.id },
      data: {
        healthProfile: healthProfile as Prisma.InputJsonValue,
        healthProfileVersion: 1,
        healthProfileUpdatedAt: new Date(),
      },
    });
  }

  // ============================================================
  // DELETE — solo dueño y sin citas activas
  // ============================================================

  async deletePet(ownerId: string, petId: string) {
    const pet = await this.prisma.pet.findUnique({
      where: { id: petId },
      include: {
        appointments: {
          where: { status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] } },
          select: { id: true },
        },
      },
    });

    if (!pet) throw new NotFoundException("Mascota no encontrada");
    if (pet.ownerId !== ownerId) {
      throw new ForbiddenException("Solo el dueño puede eliminar su mascota");
    }

    if (pet.appointments.length > 0) {
      throw new BadRequestException(
        `No puedes eliminar a ${pet.name} porque tiene ${pet.appointments.length} ` +
          `cita(s) activa(s). Cancela las citas primero.`,
      );
    }

    await this.prisma.pet.delete({ where: { id: petId } });
  }

  private async requireOwner(ownerId: string, petId: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundException("Mascota no encontrada");
    if (pet.ownerId !== ownerId) {
      throw new ForbiddenException("Solo el dueño puede editar su mascota");
    }
    return pet;
  }

  private validateHealthTimeline(dto: UpdatePetHealthProfileDto) {
    const now = Date.now();
    const pastOrPresent = (value: string | undefined, label: string) => {
      if (!value) return;
      const timestamp = new Date(value).getTime();
      if (Number.isNaN(timestamp) || timestamp > now) {
        throw new BadRequestException(`${label} no puede estar en el futuro`);
      }
    };
    const ordered = (
      start: string,
      end: string | undefined,
      label: string,
    ) => {
      if (end && new Date(end).getTime() < new Date(start).getTime()) {
        throw new BadRequestException(`${label} no puede ser anterior al evento`);
      }
    };
    const unique = (items: { id: string }[], label: string) => {
      if (new Set(items.map((item) => item.id)).size !== items.length) {
        throw new BadRequestException(`Hay identificadores duplicados en ${label}`);
      }
    };

    unique(dto.allergies, "alergias");
    unique(dto.medications, "medicamentos");
    unique(dto.conditions, "antecedentes");
    unique(dto.vaccinations, "vacunas");
    unique(dto.deworming, "desparasitación");
    unique(dto.preventiveCare, "controles preventivos");

    for (const item of dto.allergies) pastOrPresent(item.notedAt, "La fecha de alergia");
    for (const item of dto.conditions) pastOrPresent(item.diagnosedAt, "La fecha del antecedente");
    for (const item of dto.medications) {
      pastOrPresent(item.startedAt, "La fecha de inicio del medicamento");
      pastOrPresent(item.endedAt, "La fecha de fin del medicamento");
      if (item.startedAt) ordered(item.startedAt, item.endedAt, "La fecha de fin del medicamento");
    }
    for (const item of dto.vaccinations) {
      pastOrPresent(item.administeredAt, "La fecha de vacunación");
      ordered(item.administeredAt, item.nextDueAt, "La próxima vacuna");
    }
    for (const item of dto.deworming) {
      pastOrPresent(item.administeredAt, "La fecha de desparasitación");
      ordered(item.administeredAt, item.nextDueAt, "La próxima desparasitación");
    }
  }
}
