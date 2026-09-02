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
 * The domain service contains private operational fields (exact coordinates,
 * contact data, balances and verification metadata) because authenticated
 * veterinarian/admin flows need them. Public HTTP responses are therefore
 * rebuilt from an explicit allowlist here. Adding a new Prisma field cannot
 * accidentally make it public via object spread.
 */
@Injectable()
export class PublicVetPrivacyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (!this.isAnonymousVetDirectoryRequest(req)) {
      return next.handle();
    }

    return next.handle().pipe(map((payload) => this.sanitizePayload(payload)));
  }

  private isAnonymousVetDirectoryRequest(req: any): boolean {
    if (req.method !== "GET") return false;

    const path = String(req.path || req.originalUrl || "").split("?")[0];
    if (path === "/api/vets" || path === "/vets") return true;

    const detailPattern = /^\/(?:api\/)?vets\/[0-9a-f-]{36}$/i;
    return detailPattern.test(path);
  }

  private sanitizePayload(payload: any): any {
    if (payload && Array.isArray(payload.results)) {
      return {
        ...payload,
        results: payload.results.map((vet: any) => this.toPublicVet(vet)),
      };
    }

    if (payload && typeof payload === "object" && payload.id) {
      return this.toPublicVet(payload);
    }

    return payload;
  }

  private toPublicVet(vet: any) {
    const user = vet?.user
      ? {
          id: vet.user.id,
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
      prices: vet.prices,
      schedules: vet.schedules,
      reviews: vet.reviews,
      completedAppointments: vet.completedAppointments,
      totalReviews: vet.totalReviews,
    };
  }
}
