import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { MarketLaunchPolicyService } from "./market-launch-policy.service";

@Injectable()
export class MarketLaunchGuard implements CanActivate {
  constructor(private readonly policy: MarketLaunchPolicyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      body?: {
        vetId?: string;
        serviceLatitude?: number;
        serviceLongitude?: number;
      };
    }>();

    if (!this.isAppointmentCreateRequest(request)) return true;

    await this.policy.assertBookingAllowed({
      vetId: request.body?.vetId,
      serviceLatitude: request.body?.serviceLatitude,
      serviceLongitude: request.body?.serviceLongitude,
    });
    return true;
  }

  private isAppointmentCreateRequest(request: {
    method?: string;
    originalUrl?: string;
    url?: string;
  }): boolean {
    if (request.method?.toUpperCase() !== "POST") return false;
    const path = (request.originalUrl ?? request.url ?? "").split("?")[0];
    const prefix = (process.env.API_PREFIX || "api").replace(/^\/+|\/+$/g, "");
    return path === `/${prefix}/appointments` || path === "/appointments";
  }
}
