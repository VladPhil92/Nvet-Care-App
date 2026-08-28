import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  HttpException,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { HealthService } from "./health.service";

/**
 * HealthController — endpoints públicos sin auth.
 *
 * Convención:
 *  - `GET /health`: alias de `GET /health/ready` (compatibilidad)
 *  - `GET /health/live`: liveness (k8s livenessProbe)
 *  - `GET /health/ready`: readiness (k8s readinessProbe)
 *
 * Todos exentos de throttling (los probers de k8s consultan cada 10s).
 */
@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async health() {
    return this.healthService.getReadiness();
  }

  @Get("live")
  @HttpCode(HttpStatus.OK)
  async liveness() {
    return this.healthService.getLiveness();
  }

  @Get("ready")
  async readiness() {
    const status = await this.healthService.getReadiness();
    if (status.status === "down") {
      throw new HttpException(status, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return status;
  }
}
