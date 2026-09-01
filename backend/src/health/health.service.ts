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
 *    Hace ping a DB y otras dependencias realmente bloqueantes.
 *
 * El payload público nunca expone mensajes de excepción del proveedor o de
 * PostgreSQL. La revisión operativa usa logs/Sentry; el probe solo publica
 * evidencia coarse-grained apta para internet.
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
  revision: string;
  environment: string;
  checks: Record<string, ComponentHealth>;
}

interface ComponentHealth {
  status: "up" | "down";
  impact?: "blocking" | "advisory";
  latencyMs?: number;
  error?: "dependency_unavailable";
  details?: Record<string, unknown>;
}

const DB_PING_TIMEOUT_MS = 2000;
const APP_START = Date.now();

/**
 * Exposes only a validated, shortened git SHA. Provider variables may contain
 * arbitrary operator input, so untrusted values fail closed to `unknown`
 * rather than becoming public metadata.
 */
function getSafeRevision(): string {
  const candidate = [
    process.env.APP_REVISION,
    process.env.RAILWAY_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
  ]
    .find((value) => value?.trim())
    ?.trim();

  if (!candidate || !/^[0-9a-f]{7,64}$/i.test(candidate)) {
    return "unknown";
  }

  return candidate.slice(0, 12).toLowerCase();
}

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
      revision: getSafeRevision(),
      environment: process.env.NODE_ENV || "development",
      checks: {
        process: { status: "up", impact: "blocking" },
      },
    };
  }

  /**
   * Readiness: chequea dependencias externas realmente necesarias para servir
   * tráfico. La memoria V8 se conserva como telemetría advisory: `heapTotal`
   * es un heap dinámico administrado por V8 y no representa el límite real del
   * contenedor, por lo que no debe sacar una instancia sana del tráfico.
   */
  async getReadiness(): Promise<HealthStatus> {
    const [dbCheck, memoryCheck] = await Promise.all([
      this.checkDatabase(),
      Promise.resolve(this.checkMemory()),
    ]);

    const checks: Record<string, ComponentHealth> = {
      database: dbCheck,
      memory: memoryCheck,
    };
    const blockingDown = Object.values(checks).some(
      (check) => check.impact === "blocking" && check.status === "down",
    );

    return {
      status: blockingDown ? "down" : "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - APP_START) / 1000),
      version: process.env.APP_VERSION || "1.0.0",
      revision: getSafeRevision(),
      environment: process.env.NODE_ENV || "development",
      checks,
    };
  }

  // ============================================================
  // PRIVATE CHECKS
  // ============================================================

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
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
        impact: "blocking",
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        status: "down",
        impact: "blocking",
        latencyMs: Date.now() - start,
        error: "dependency_unavailable",
      };
    }
  }

  /**
   * Memory telemetry: marca presión relativa del heap de V8 para diagnóstico,
   * pero es advisory. `heapTotal` crece y decrece dinámicamente y no equivale
   * al límite RSS/container del proveedor; usarlo como readiness gate genera
   * falsos negativos aun cuando proceso y base de datos pueden servir tráfico.
   */
  private checkMemory(): ComponentHealth {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    const utilization =
      usage.heapTotal > 0 ? usage.heapUsed / usage.heapTotal : 0;

    return {
      status: utilization > 0.9 ? "down" : "up",
      impact: "advisory",
      details: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        utilizationPct: Math.round(utilization * 100),
      },
    };
  }
}
