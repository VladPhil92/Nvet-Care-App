import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus } from '@prisma/client';
import { CreateReviewDto, UpdateReviewDto, VetReviewsFilterDto } from './dto/review.dto';

/**
 * ReviewsService — sistema de calificaciones de veterinarios.
 *
 * Reglas de negocio:
 *  1. Solo el cliente de la cita puede dejar una review.
 *  2. La cita debe estar en estado COMPLETED.
 *  3. Solo se permite una review por cita (idempotente por appointmentId).
 *  4. El cliente puede editar su propia review (rating o comentario).
 *  5. El admin puede eliminar reviews abusivas.
 *  6. Tras crear/editar/eliminar, se recalcula el rating promedio del vet
 *     y se actualiza VetProfile.rating y .reviewCount.
 */
@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // CREATE
  // ============================================================

  async createReview(clientId: string, dto: CreateReviewDto) {
    // 1. Validar que la cita existe
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: { vet: true, review: true },
    });

    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }

    // 2. Solo el cliente de la cita puede calificar
    if (appointment.clientId !== clientId) {
      throw new ForbiddenException(
        'Solo el cliente de la cita puede dejar una calificación',
      );
    }

    // 3. La cita debe estar completada
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException(
        `Solo puedes calificar citas completadas. Estado actual: ${appointment.status}`,
      );
    }

    // 4. Una sola review por cita
    if (appointment.review) {
      throw new ConflictException(
        'Ya dejaste una calificación para esta cita. Puedes editarla.',
      );
    }

    // 5. Crear review
    const review = await this.prisma.review.create({
      data: {
        appointmentId: dto.appointmentId,
        vetId: appointment.vetId,
        clientId,
        rating: dto.rating,
        comment: dto.comment,
      },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    // 6. Recalcular rating del vet
    await this.recalculateVetRating(appointment.vetId);

    this.logger.log(
      `Review creada: appointmentId=${dto.appointmentId} vetId=${appointment.vetId} rating=${dto.rating}`,
    );

    return review;
  }

  // ============================================================
  // UPDATE (solo el autor)
  // ============================================================

  async updateReview(clientId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) throw new NotFoundException('Calificación no encontrada');
    if (review.clientId !== clientId) {
      throw new ForbiddenException('Solo puedes editar tus propias calificaciones');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.comment !== undefined && { comment: dto.comment }),
      },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    await this.recalculateVetRating(review.vetId);
    return updated;
  }

  // ============================================================
  // DELETE (solo el autor o admin)
  // ============================================================

  async deleteReview(requesterId: string, reviewId: string, isAdmin = false) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) throw new NotFoundException('Calificación no encontrada');

    if (!isAdmin && review.clientId !== requesterId) {
      throw new ForbiddenException('Solo puedes eliminar tus propias calificaciones');
    }

    await this.prisma.review.delete({ where: { id: reviewId } });
    await this.recalculateVetRating(review.vetId);
    this.logger.log(`Review eliminada: id=${reviewId} por userId=${requesterId}`);
  }

  // ============================================================
  // GET — reviews de un vet (público)
  // ============================================================

  async getVetReviews(vetId: string, filters: VetReviewsFilterDto) {
    const limit = filters.limit ?? 10;
    const offset = filters.offset ?? 0;

    // Verificar que el vet existe
    const vetProfile = await this.prisma.vetProfile.findFirst({
      where: {
        OR: [{ id: vetId }, { userId: vetId }],
      },
      select: {
        id: true,
        rating: true,
        reviewCount: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    if (!vetProfile) throw new NotFoundException('Veterinario no encontrado');

    const where: any = { vetId: vetProfile.id };
    if (filters.minRating) {
      where.rating = { gte: filters.minRating };
    }

    const [results, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.review.count({ where }),
    ]);

    // Distribución de ratings (para mostrar barras en la UI)
    const ratingDistribution = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { vetId: vetProfile.id },
      _count: true,
    });

    const dist = [1, 2, 3, 4, 5].reduce(
      (acc, r) => {
        const found = ratingDistribution.find((rd) => rd.rating === r);
        acc[r] = found ? found._count : 0;
        return acc;
      },
      {} as Record<number, number>,
    );

    return {
      vetId: vetProfile.id,
      vetName: `${vetProfile.user.firstName} ${vetProfile.user.lastName}`,
      averageRating: vetProfile.rating ?? 0,
      totalReviews: vetProfile.reviewCount,
      ratingDistribution: dist,
      results,
      total,
      limit,
      offset,
      hasMore: offset + results.length < total,
    };
  }

  // ============================================================
  // GET — review de una cita específica
  // ============================================================

  async getAppointmentReview(clientId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { clientId: true },
    });

    if (!appointment) throw new NotFoundException('Cita no encontrada');

    // Solo el cliente puede ver su propia review
    if (appointment.clientId !== clientId) {
      throw new ForbiddenException('No tienes acceso a esta calificación');
    }

    const review = await this.prisma.review.findUnique({
      where: { appointmentId },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    return review; // null si aún no ha calificado
  }

  // ============================================================
  // GET — reviews propias del cliente
  // ============================================================

  async getMyReviews(clientId: string, filters: VetReviewsFilterDto) {
    const limit = filters.limit ?? 10;
    const offset = filters.offset ?? 0;

    const [results, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { clientId },
        include: {
          appointment: {
            select: {
              id: true,
              serviceType: true,
              date: true,
              vet: {
                include: {
                  user: { select: { firstName: true, lastName: true, avatar: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.review.count({ where: { clientId } }),
    ]);

    return { results, total, limit, offset, hasMore: offset + results.length < total };
  }

  // ============================================================
  // PRIVATE — recalcular rating del vet
  // ============================================================

  /**
   * Recalcula el rating promedio y el conteo de reviews del vet.
   * Usa aggregate de Prisma para calcular el promedio exacto en la DB.
   * Se llama después de cualquier operación de write en reviews.
   */
  private async recalculateVetRating(vetId: string): Promise<void> {
    const aggregate = await this.prisma.review.aggregate({
      where: { vetId },
      _avg: { rating: true },
      _count: true,
    });

    const avgRating = aggregate._avg.rating ?? 0;
    const roundedRating = Math.round(avgRating * 10) / 10; // Redondear a 1 decimal

    await this.prisma.vetProfile.update({
      where: { id: vetId },
      data: {
        rating: roundedRating,
        reviewCount: aggregate._count,
      },
    });

    this.logger.log(
      `VetProfile actualizado: vetId=${vetId} rating=${roundedRating} reviewCount=${aggregate._count}`,
    );
  }
}
