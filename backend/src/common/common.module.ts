import { Module, MiddlewareConsumer, NestModule, Global } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { AllExceptionsFilter } from "./filters/all-exceptions.filter";
import { LoggingInterceptor } from "./interceptors/logging.interceptor";
import { RequestIdMiddleware } from "./middlewares/request-id.middleware";
import { pinoConfig } from "./logger/pino.config";
import { throttlerConfig } from "./throttler/throttler.config";

/**
 * CommonModule — concentra cross-cutting concerns:
 *  - Logger estructurado (pino)
 *  - Rate limiting (throttler)
 *  - Filter global de excepciones
 *  - Interceptor global de logging de slow requests
 *  - Middleware de request-id
 *
 * Marcado como @Global para que sus providers estén disponibles
 * en cualquier módulo sin necesidad de importarlo.
 */
@Global()
@Module({
  imports: [
    LoggerModule.forRoot(pinoConfig),
    ThrottlerModule.forRoot(throttlerConfig),
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
