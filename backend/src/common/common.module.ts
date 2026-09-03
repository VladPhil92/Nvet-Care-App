import { Module, MiddlewareConsumer, NestModule, Global } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { AllExceptionsFilter } from "./filters/all-exceptions.filter";
import { LoggingInterceptor } from "./interceptors/logging.interceptor";
import { PublicVetPrivacyInterceptor } from "./interceptors/public-vet-privacy.interceptor";
import { FinancialPrivacyInterceptor } from "./interceptors/financial-privacy.interceptor";
import { RequestIdMiddleware } from "./middlewares/request-id.middleware";
import { pinoConfig } from "./logger/pino.config";
import { throttlerConfig } from "./throttler/throttler.config";

/**
 * CommonModule — concentra cross-cutting concerns:
 *  - Logger estructurado (pino)
 *  - Rate limiting (throttler)
 *  - Filter global de excepciones
 *  - Logging de requests
 *  - Privacy allowlist del directorio veterinario público
 *  - Redacción fail-safe de secretos financieros en respuestas HTTP
 *  - Middleware de request-id
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
      provide: APP_INTERCEPTOR,
      useClass: PublicVetPrivacyInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: FinancialPrivacyInterceptor,
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
