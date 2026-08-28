import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { captureException } from "../sentry/sentry.config";

/**
 * Filter global que normaliza TODAS las excepciones a un formato consistente.
 *
 * Decisiones:
 *  - Respuesta JSON estructurada: { statusCode, message, error, requestId, timestamp }
 *  - Mapeo de errores Prisma a códigos HTTP semánticos
 *  - Errores 5xx capturados a Sentry con contexto enriquecido
 *  - 4xx no van a Sentry (son responsabilidad del cliente)
 *  - En producción, ocultar stack traces en respuestas
 *  - Log estructurado con request-id para correlación
 */

interface NormalizedError {
  statusCode: number;
  message: string | string[];
  error: string;
  requestId?: string;
  timestamp: string;
  /** Solo presente en desarrollo */
  stack?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProd = process.env.NODE_ENV === "production";

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string; user?: any }>();

    const normalized = this.normalizeException(exception);

    // Enriquecer con request-id y timestamp
    normalized.requestId = (request as any).id;
    normalized.timestamp = new Date().toISOString();

    // Stack solo en dev
    if (!this.isProd && exception instanceof Error) {
      normalized.stack = exception.stack;
    }

    // Log + Sentry para 5xx
    if (normalized.statusCode >= 500) {
      this.logger.error(
        `[${normalized.requestId}] ${request.method} ${request.url} → ${normalized.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );

      if (exception instanceof Error) {
        captureException(exception, {
          user: request.user
            ? { id: request.user.id, email: request.user.email }
            : undefined,
          tags: {
            method: request.method,
            url: request.url,
          },
          extra: {
            requestId: normalized.requestId,
          },
        });
      }
    } else if (normalized.statusCode >= 400) {
      this.logger.warn(
        `[${normalized.requestId}] ${request.method} ${request.url} → ${normalized.statusCode}: ${normalized.message}`,
      );
    }

    response.status(normalized.statusCode).json(normalized);
  }

  /**
   * Mapea cualquier excepción a NormalizedError.
   */
  private normalizeException(exception: unknown): NormalizedError {
    // 1. HttpException de Nest (validación, ForbiddenException, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === "string") {
        return {
          statusCode: status,
          message: resp,
          error: HttpException.name,
          timestamp: "",
        };
      }
      const r = resp as Record<string, unknown>;
      return {
        statusCode: status,
        message: (r.message as string | string[]) ?? exception.message,
        error: (r.error as string) ?? exception.constructor.name,
        timestamp: "",
      };
    }

    // 2. Errores de Prisma
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaError(exception);
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: "Datos inválidos para la operación de base de datos",
        error: "PrismaValidationError",
        timestamp: "",
      };
    }

    // 3. Error nativo
    if (exception instanceof Error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: this.isProd ? "Error interno del servidor" : exception.message,
        error: exception.constructor.name,
        timestamp: "",
      };
    }

    // 4. Cualquier otro tipo
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Error interno del servidor",
      error: "UnknownError",
      timestamp: "",
    };
  }

  /**
   * Mapea códigos de error Prisma a HTTP status semánticos.
   * Referencia: https://www.prisma.io/docs/reference/api-reference/error-reference
   */
  private mapPrismaError(
    err: Prisma.PrismaClientKnownRequestError,
  ): NormalizedError {
    switch (err.code) {
      case "P2002": // Unique constraint
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `El registro ya existe (constraint único: ${(err.meta?.target as string[])?.join(", ") ?? "unknown"})`,
          error: "UniqueConstraintViolation",
          timestamp: "",
        };
      case "P2003": // Foreign key
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: "Referencia inválida a otro registro",
          error: "ForeignKeyViolation",
          timestamp: "",
        };
      case "P2025": // Record not found
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: "Registro no encontrado",
          error: "NotFound",
          timestamp: "",
        };
      case "P2014": // Required relation violation
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: "Falta una relación obligatoria",
          error: "RequiredRelationViolation",
          timestamp: "",
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: this.isProd
            ? "Error en la base de datos"
            : `Prisma error ${err.code}: ${err.message}`,
          error: "PrismaError",
          timestamp: "",
        };
    }
  }
}
