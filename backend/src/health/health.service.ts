import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * HealthService — chequeos de salud separados en liveness vs readiness.
 *
 * Convención Kubernetes:
 *  - **Liveness**: ¿el proceso está vivo? Si falla, k8s reinicia el pod.
 *    Solo hace checks rápidos en memoria (uptime, memory).
 *  - **Readiness**: ¿el servicio puede atender tráfico? Si falla, k8s
 *    saca el pod del load balancer pero NO lo reinicia.
 *    Hace ping a DB, cache externa, etc.
 *
 * Estos contratos respetan SemVer:
 *  - Cambios breaking en el shape de respuesta requieren aviso.
 *  - Status codes: 200 si OK, 503 si DOWN.
 */

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  environment: string;
  checks: Record<string, ComponentHealth>;
}

interface ComponentHealth {
  status: "up" | "down";
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

const DB_PING_TIMEOUT_MS = 2000;
const APP_START = Date.now();

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness: muy rápido, sin dependencias externas.
   */
  async getLiveness(): Promise<HealthStatus> {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - APP_START) / 1000),
      version: process.env.APP_VERSION || "1.0.0",
      environment: process.env.NODE_ENV || "development",
      checks: {
        process: { status: "up" },
      },
    };
  }

  /**
   * Readiness: chequea dependencias externas (DB).
   * Si alguna falla → status 'down' y HTTP 503.
   */
  async getReadiness(): Promise<HealthStatus> {
    const [dbCheck, memoryCheck] = await Promise.all([
      this.checkDatabase(),
      Promise.resolve(this.checkMemory()),
    ]);

    const allUp = dbCheck.status === "up" && memoryCheck.status === "up";
    const anyDown = dbCheck.status === "down";

    return {
      status: anyDown ? "down" : allUp ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - APP_START) / 1000),
      version: process.env.APP_VERSION || "1.0.0",
      environment: process.env.NODE_ENV || "development",
      checks: {
        database: dbCheck,
        memory: memoryCheck,
      },
    };
  }

  // ============================================================
  // PRIVATE CHECKS
  // ============================================================

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      // Race entre ping y timeout
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("DB ping timeout")),
            DB_PING_TIMEOUT_MS,
          ),
        ),
      ]);
      return {
        status: "up",
        latencyMs: Date.now() - start,
      };
    } catch (e) {
      return {
        status: "down",
        latencyMs: Date.now() - start,
        error: (e as Error).message,
      };
    }
  }

  /**
   * Memory check: alert si heap usado > 90% del límite.
   * El threshold es indicativo; en producción ajustar según observación real.
   */
  private checkMemory(): ComponentHealth {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    const utilization = usage.heapUsed / usage.heapTotal;

    return {
      status: utilization > 0.9 ? "down" : "up",
      details: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        utilizationPct: Math.round(utilization * 100),
      },
    };
  }
}
