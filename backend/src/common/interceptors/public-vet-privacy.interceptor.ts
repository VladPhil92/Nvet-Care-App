import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, map } from "rxjs";

/**
 * Last-mile privacy boundary for the anonymous veterinarian directory.
 *
 * Public responses are rebuilt from explicit allowlists. No Prisma record or
 * nested relation is spread directly into an anonymous response, so adding a
 * new database field cannot make it public by accident.
 */
@Injectable()
export class PublicVetPrivacyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (!this.isPublicVetRequest(req)) {
      return next.handle();
    }

    return next.handle().pipe(map((payload) => this.sanitizePayload(payload)));
  }

  private isPublicVetRequest(req: any): boolean {
    if (req.method !== "GET") return false;

    const path = String(req.path || req.originalUrl || "").split("?")[0];
    if (path === "/api/vets" || path === "/vets") return true;

    return /^\/(?:api\/)?vets\/[0-9a-f-]{36}(?:\/prices)?$/i.test(path);
  }

  private sanitizePayload(payload: any): any {
    if (payload && Array.isArray(payload.results)) {
      return {
        ...payload,
        results: payload.results.map((vet: any) => this.toPublicVet(vet)),
      };
    }

    if (Array.isArray(payload)) {
      return payload.map((item) =>
        this.looksLikePrice(item) ? this.toPublicPrice(item) : item,
      );
    }

    if (payload && typeof payload === "object" && payload.id) {
      return this.looksLikePrice(payload)
        ? this.toPublicPrice(payload)
        : this.toPublicVet(payload);
    }

    return payload;
  }

  private toPublicVet(vet: any) {
    const user = vet?.user
      ? {
          firstName: vet.user.firstName,
          lastName: vet.user.lastName,
          avatar: vet.user.avatar,
        }
      : undefined;

    return {
      id: vet.id,
      user,
      licenseNumber: vet.licenseNumber,
      specialties: vet.specialties,
      tier: vet.tier,
      bio: vet.bio,
      yearsExperience: vet.yearsExperience,
      rating: vet.rating,
      reviewCount: vet.reviewCount,
      isVerified: vet.isVerified,
      isAvailableNow: vet.isAvailableNow,
      city: vet.city,
      department: vet.department,
      distance: vet.distance,
      prices: Array.isArray(vet.prices)
        ? vet.prices.map((price: any) => this.toPublicPrice(price))
        : undefined,
      schedules: Array.isArray(vet.schedules)
        ? vet.schedules.map((schedule: any) => this.toPublicSchedule(schedule))
        : undefined,
      reviews: Array.isArray(vet.reviews)
        ? vet.reviews.map((review: any) => this.toPublicReview(review))
        : undefined,
      completedAppointments: vet.completedAppointments,
      totalReviews: vet.totalReviews,
    };
  }

  private looksLikePrice(value: any): boolean {
    return Boolean(value && "serviceName" in value && "priceCop" in value);
  }

  private toPublicPrice(price: any) {
    return {
      id: price.id,
      serviceName: price.serviceName,
      priceCop: price.priceCop,
      priceCtg: price.priceCtg,
      isActive: price.isActive,
    };
  }

  private toPublicSchedule(schedule: any) {
    return {
      id: schedule.id,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      slotDuration: schedule.slotDuration,
      isActive: schedule.isActive,
    };
  }

  private toPublicReview(review: any) {
    const lastInitial = review?.client?.lastName
      ? `${String(review.client.lastName).trim().charAt(0)}.`
      : undefined;

    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      client: review.client
        ? {
            firstName: review.client.firstName,
            lastName: lastInitial,
            avatar: review.client.avatar,
          }
        : undefined,
    };
  }
}
