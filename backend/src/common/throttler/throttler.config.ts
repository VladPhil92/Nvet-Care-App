import { ThrottlerModuleOptions, seconds } from "@nestjs/throttler";
import { SetMetadata, applyDecorators } from "@nestjs/common";

/**
 * Configuración multi-tier de rate limiting.
 *
 * Filosofía:
 *  - `short` (1s): protege contra bursts rápidos (scraping, brute force)
 *  - `medium` (10s): smoothing del rate sostenido
 *  - `long` (1min): cap horario para tareas pesadas
 *
 * Cualquier endpoint puede agregar overrides estrictos con `@Throttle({...})`.
 *
 * En producción, usar `@nestjs/throttler-storage-redis` para que el contador
 * sea consistente entre múltiples instancias del backend.
 */

export const throttlerConfig: ThrottlerModuleOptions = [
  {
    name: "short",
    ttl: seconds(1),
    limit: 10, // 10 req/s por IP
  },
  {
    name: "medium",
    ttl: seconds(10),
    limit: 50, // 50 req cada 10s
  },
  {
    name: "long",
    ttl: seconds(60),
    limit: 200, // 200 req/min por IP (default global)
  },
];

// ============================================================
// DECORATORS PARA ENDPOINTS SENSIBLES
// ============================================================

/**
 * Para endpoints de autenticación: máximo 5 intentos por minuto por IP.
 * Aplicar en `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh`.
 */
export const ThrottleAuth = () =>
  applyDecorators(
    SetMetadata("throttler:limit", { default: { limit: 5, ttl: seconds(60) } }),
  );

/**
 * Para procesar pagos: máximo 10 por minuto, dado que requieren idempotency
 * key y son operaciones costosas.
 */
export const ThrottlePayments = () =>
  applyDecorators(
    SetMetadata("throttler:limit", {
      default: { limit: 10, ttl: seconds(60) },
    }),
  );

/**
 * Para uploads de documentos: 5 por hora (verification + transfer proofs).
 */
export const ThrottleUpload = () =>
  applyDecorators(
    SetMetadata("throttler:limit", {
      default: { limit: 5, ttl: seconds(3600) },
    }),
  );

/**
 * Decorator para SKIP throttling (uso en healthchecks, webhooks internos).
 */
export const SkipThrottle = () => SetMetadata("throttler:skip", true);
