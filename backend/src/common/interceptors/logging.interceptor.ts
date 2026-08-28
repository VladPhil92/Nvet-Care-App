import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

/**
 * LoggingInterceptor — agrega un log estructurado a la respuesta de cada
 * controller method, incluso si pino-http ya cubre el ciclo HTTP, esto
 * captura el contexto del controller (handler name, class).
 *
 * Útil para troubleshooting cuando se quiere correlacionar:
 *   "El método X del Controller Y procesó la request Z en N ms"
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("Request");

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const start = Date.now();
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<{
      method: string;
      url: string;
      id?: string;
      user?: { id?: string };
    }>();

    const handler = context.getHandler().name;
    const cls = context.getClass().name;

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          // Solo loguear endpoints lentos (>500ms) para no saturar logs
          if (ms > 500) {
            this.logger.warn(
              `SLOW ${cls}.${handler} ${req.method} ${req.url} ${ms}ms`,
            );
          }
        },
        error: (err) => {
          const ms = Date.now() - start;
          this.logger.error(
            `FAIL ${cls}.${handler} ${req.method} ${req.url} ${ms}ms — ${err.message}`,
          );
        },
      }),
    );
  }
}
