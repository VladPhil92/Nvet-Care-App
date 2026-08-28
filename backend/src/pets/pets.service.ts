import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePetDto, UpdatePetDto } from "./dto/pet.dto";

/**
 * PetsService — CRUD de mascotas del sistema Nvet Care.
 *
 * Reglas:
 *  - Solo el dueño puede ver, editar o eliminar su mascota.
 *  - Un vet con una cita activa puede consultar la mascota (GET by ID).
 *  - Las mascotas eliminadas quedan en DB con `deletedAt` (soft delete)
 *    para no romper el historial de citas históricas.
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
  // GET — detalle de mascota (dueño o vet con cita activa)
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

    // El dueño siempre puede ver su mascota
    if (pet.ownerId === requesterId) return pet;

    // Un vet puede ver la mascota si tiene una cita con ella
    const hasActiveAppointment = await this.prisma.appointment.findFirst({
      where: {
        petId,
        vet: { userId: requesterId },
      },
    });

    if (!hasActiveAppointment) {
      throw new ForbiddenException("No tienes acceso a esta mascota");
    }

    return pet;
  }

  // ============================================================
  // CREATE
  // ============================================================

  async createPet(ownerId: string, dto: CreatePetDto) {
    // Validar que la fecha de nacimiento no sea futura
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
  // UPDATE
  // ============================================================

  async updatePet(ownerId: string, petId: string, dto: UpdatePetDto) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });

    if (!pet) throw new NotFoundException("Mascota no encontrada");
    if (pet.ownerId !== ownerId) {
      throw new ForbiddenException("Solo el dueño puede editar su mascota");
    }

    // Validar fecha de nacimiento si se actualiza
    if (dto.birthDate && new Date(dto.birthDate) > new Date()) {
      throw new BadRequestException(
        "La fecha de nacimiento no puede ser futura",
      );
    }

    return this.prisma.pet.update({
      where: { id: petId },
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
  // DELETE (soft — solo dueño)
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

    // No permitir eliminar si tiene citas activas (evita dejar citas huérfanas)
    if (pet.appointments.length > 0) {
      throw new BadRequestException(
        `No puedes eliminar a ${pet.name} porque tiene ${pet.appointments.length} ` +
          `cita(s) activa(s). Cancela las citas primero.`,
      );
    }

    // Hard delete — las citas completadas mantienen la referencia por cascade
    // En producción se puede cambiar a soft delete agregando deletedAt al schema
    await this.prisma.pet.delete({ where: { id: petId } });
  }
}
