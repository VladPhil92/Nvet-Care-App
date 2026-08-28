import { Params } from "nestjs-pino";
import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";

/**
 * Configuración del logger estructurado para producción.
 *
 * Decisiones técnicas:
 *  - `pino` por su throughput (>10x más rápido que winston)
 *  - JSON output en producción (parseable por Loki/Datadog/CloudWatch)
 *  - Pretty print en desarrollo (más legible humanamente)
 *  - Auto-redaction de PII y secretos
 *  - request-id propagado desde header `X-Request-Id` (correlación cliente↔servidor)
 *  - Auto-correlación con user-id desde JWT (si existe)
 *
 * Niveles de log:
 *  - fatal: errores que requieren shutdown inmediato
 *  - error: excepciones no manejadas, fallos de DB
 *  - warn: condiciones inesperadas pero recuperables (auth fail, validation fail)
 *  - info: requests HTTP, lifecycle events (default en prod)
 *  - debug: queries DB, payloads (default en dev)
 *  - trace: muy detallado, solo en troubleshooting
 */

const isProd = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || (isProd ? "info" : "debug");

/**
 * Campos a redactar automáticamente en logs.
 * Incluye headers de auth y campos comunes de PII.
 *
 * El redact pattern usa la sintaxis path expression de pino:
 *  - `req.headers.authorization` redacta solo ese header
 *  - `*.password` redacta cualquier propiedad llamada password
 */
const REDACT_PATHS = [
  // Headers sensibles
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',

  // Body / payload PII
  "req.body.password",
  "req.body.passwordHash",
  "req.body.refreshToken",
  "req.body.accessToken",

  // Wildcards profundos
  "*.password",
  "*.passwordHash",
  "*.refreshToken",
  "*.accessToken",
  "*.creditCard",
  "*.cvv",
  "*.ssn",
  "*.documentId",

  // Response sensitive fields
  'res.headers["set-cookie"]',
];

export const pinoConfig: Params = {
  pinoHttp: {
    level: logLevel,

    // Pretty print solo en dev (en prod, JSON estructurado a stdout)
    ...(isProd
      ? {}
      : {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss.l",
              ignore: "pid,hostname",
              singleLine: false,
            },
          },
        }),

    // Generar / propagar request-id
    genReqId: (req: IncomingMessage) => {
      const fromHeader = req.headers["x-request-id"];
      if (typeof fromHeader === "string" && fromHeader.length > 0) {
        return fromHeader;
      }
      return randomUUID();
    },

    // Atributos automáticos en cada log de request
    customProps: (req: IncomingMessage) => {
      const r = req as IncomingMessage & {
        user?: { id?: string; role?: string };
      };
      return {
        userId: r.user?.id,
        userRole: r.user?.role,
      };
    },

    // Request serialization: incluir solo campos relevantes
    serializers: {
      req: (req: IncomingMessage & { id?: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.socket?.remoteAddress,
        userAgent: req.headers["user-agent"],
      }),
      res: (res: ServerResponse & { statusCode: number }) => ({
        statusCode: res.statusCode,
      }),
      err: (err: Error & { code?: string; statusCode?: number }) => ({
        type: err.constructor.name,
        message: err.message,
        stack: err.stack,
        code: err.code,
        statusCode: err.statusCode,
      }),
    },

    // Redaction de campos sensibles
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },

    // Custom log level por status code
    customLogLevel: (_req, res, err) => {
      if (err || (res as any).statusCode >= 500) return "error";
      if ((res as any).statusCode >= 400) return "warn";
      if ((res as any).statusCode >= 300) return "info";
      return "info";
    },

    // Mensaje custom: resumen humano en una línea
    customSuccessMessage: (req: any, res: any, responseTime: number) => {
      return `${req.method} ${req.url} ${res.statusCode} (${responseTime}ms)`;
    },
    customErrorMessage: (req: any, res: any, err: Error) => {
      return `${req.method} ${req.url} failed: ${err.message}`;
    },

    // No loguear endpoints de health check (ruido)
    autoLogging: {
      ignore: (req: IncomingMessage) =>
        req.url === "/api/health" || req.url === "/health",
    },
  },
};
