import { Injectable, ConflictException, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * IdempotencyService — replay-safe para POSTs críticos (pagos, citas).
 *
 * Por qué persistir en DB en lugar de cache memoria:
 *  - Sobrevive a reinicios del servidor.
 *  - Funciona en deployments multi-instancia.
 *  - El cliente puede reintentar un pago tras 12 horas y NO duplicarlo.
 *
 * Flow:
 *  1. Cliente envía POST con header `Idempotency-Key: uuid-v4`
 *  2. Service busca la key en DB
 *  3a. Si existe Y el hash del body coincide → retorna respuesta cacheada
 *  3b. Si existe pero hash distinto → 409 Conflict (mismo key, body diferente)
 *  3c. Si no existe → ejecuta operación, cachea resultado, retorna
 *
 * TTL recomendado: 24 horas (suficiente para reintentos extendidos por
 * fallos de red persistentes, pero bounded para no inflar la tabla).
 *
 * Cleanup: un cron job debe ejecutar `cleanupExpired()` diariamente.
 */

interface IdempotencyResult<T> {
  /** True si la operación ya estaba cacheada (hit) */
  cached: boolean;
  /** Resultado cacheado o recién computado */
  result: T;
  /** Status HTTP cacheado */
  status: number;
}

const DEFAULT_TTL_HOURS = 24;

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Wrapper para operaciones idempotentes.
   *
   * Si la key ya existió con el mismo body, retorna el resultado cacheado.
   * Si el body cambió, lanza 409 Conflict.
   * Si no existió, ejecuta `operation()` y cachea el resultado.
   */
  async execute<T>(params: {
    key: string;
    endpoint: string;
    userId?: string;
    requestBody: unknown;
    operation: () => Promise<{ status: number; body: T }>;
    ttlHours?: number;
  }): Promise<IdempotencyResult<T>> {
    const { key, endpoint, userId, requestBody, operation } = params;
    const ttlHours = params.ttlHours ?? DEFAULT_TTL_HOURS;

    if (!key || key.length < 8) {
      throw new Error("Idempotency key requerido (min 8 chars)");
    }

    const requestHash = this.hashBody(requestBody);

    // 1. Lookup en DB
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (existing) {
      // ¿Expiró?
      if (existing.expiresAt < new Date()) {
        await this.prisma.idempotencyKey.delete({ where: { key } });
        this.logger.debug(`Expired idempotency key removed: ${key}`);
      } else {
        // Mismo hash → cache hit
        if (existing.requestHash === requestHash) {
          return {
            cached: true,
            status: existing.responseStatus,
            result: existing.responseBody as T,
          };
        }
        // Hash distinto → mismo key con body diferente: error semántico
        throw new ConflictException(
          "Idempotency key reutilizada con un body diferente. " +
            "Genera una nueva key para esta operación.",
        );
      }
    }

    // 2. Ejecutar operación real
    const result = await operation();

    // 3. Persistir resultado
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key,
          endpoint,
          userId,
          requestHash,
          responseStatus: result.status,
          responseBody: result.body as any,
          expiresAt,
        },
      });
    } catch (e) {
      // Si dos requests concurrentes con la misma key llegan simultáneamente,
      // una de ellas verá un error de constraint único. Este es un caso raro
      // de race condition; loggeamos pero no fallamos la respuesta principal.
      this.logger.warn(
        `Idempotency persist failed (probably race condition): ${(e as Error).message}`,
      );
    }

    return {
      cached: false,
      status: result.status,
      result: result.body,
    };
  }

  /**
   * Cleanup periódico de keys expiradas.
   * Llamar desde un cron job diario.
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    this.logger.log(
      `Cleanup: ${result.count} idempotency keys expiradas eliminadas`,
    );
    return result.count;
  }

  // ----------------------------------------------------------
  // PRIVATE
  // ----------------------------------------------------------

  /**
   * Hash determinístico del body. Usamos JSON.stringify con keys ordenadas
   * para que `{a:1, b:2}` y `{b:2, a:1}` produzcan el mismo hash.
   */
  private hashBody(body: unknown): string {
    const stable = this.stableStringify(body);
    return createHash("sha256").update(stable).digest("hex");
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) return "null";
    if (typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return "[" + value.map((v) => this.stableStringify(v)).join(",") + "]";
    }
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return (
      "{" +
      keys
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            this.stableStringify((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  }
}
