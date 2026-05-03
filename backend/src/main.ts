// IMPORTANTE: Sentry debe inicializarse antes que cualquier otro import que cree handlers HTTP
import { initSentry } from './common/sentry/sentry.config';
initSentry();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

/**
 * Bootstrap del backend Nvet Care.
 *
 * Stack de seguridad / performance aplicado en orden:
 *  1. Sentry (más arriba) — captura errores desde el primer momento
 *  2. helmet — security headers (CSP, HSTS, X-Frame-Options)
 *  3. compression — gzip/brotli sobre el body
 *  4. CORS estricto — whitelist de orígenes
 *  5. Body limits — 1 MB JSON / 10 MB raw
 *  6. ValidationPipe — whitelist + transform + forbidNonWhitelisted
 *  7. Trust proxy — X-Forwarded-* respetado tras LB / CDN
 *  8. Graceful shutdown — drena conexiones en SIGTERM/SIGINT
 */
async function bootstrap() {
  const app: INestApplication = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer logs hasta que pino esté listo
    rawBody: true,    // Preserva `req.rawBody` para validación HMAC de webhooks PSE
  });

  // ----------------------------------------------------------
  // LOGGER
  // ----------------------------------------------------------
  app.useLogger(app.get(PinoLogger));

  // ----------------------------------------------------------
  // PREFIX & TRUST PROXY
  // ----------------------------------------------------------
  app.setGlobalPrefix('api');
  // Detrás de un load balancer / Cloudflare: confiar en X-Forwarded-For
  // para que el throttler use la IP real del cliente.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // ----------------------------------------------------------
  // SECURITY HEADERS (Helmet)
  // ----------------------------------------------------------
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'wss:', 'https:'],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31_536_000, // 1 año
        includeSubDomains: true,
        preload: true,
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // ----------------------------------------------------------
  // COMPRESSION (gzip/brotli)
  // ----------------------------------------------------------
  app.use(
    compression({
      level: 6, // balance entre CPU y compresión
      threshold: 1024, // no comprimir respuestas <1 KB
      filter: (req, res) => {
        // Respeta x-no-compression header
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
    }),
  );

  // ----------------------------------------------------------
  // BODY LIMITS + RAW BODY CAPTURE (para HMAC de webhooks)
  // ----------------------------------------------------------
  // Por defecto express usa 100 KB. Subimos a 1 MB para JSON
  // (uploads van por multipart con su propio límite en Multer).
  //
  // Además, capturamos el `rawBody` con un `verify` callback en
  // `express.json` para que el `PseWebhookGuard` pueda calcular el HMAC
  // contra los bytes exactos enviados por el provider (NestJS `rawBody: true`
  // necesita este verify para poblar `req.rawBody`).
  const expressApp = app.getHttpAdapter().getInstance();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require('express');
  expressApp.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res: any, buf: Buffer) => {
        if (buf?.length) req.rawBody = buf;
      },
    }),
  );
  expressApp.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------
  const allowedOrigins = [
    'http://localhost:5173', // Dashboard (Vite)
    'http://localhost:8081', // Mobile (Metro)
    'http://localhost:3001',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Idempotency-Key',
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400, // preflight cached 24h
  });

  // ----------------------------------------------------------
  // VALIDATION PIPE
  // ----------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ----------------------------------------------------------
  // GRACEFUL SHUTDOWN
  // ----------------------------------------------------------
  // Al recibir SIGTERM/SIGINT, drenar conexiones en curso (max 15s)
  // antes de salir. PrismaService implementa OnModuleDestroy.
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  // Logs finales (estos sí van a pino)
  const logger = app.get(PinoLogger);
  logger.log(`Nvet Care API running on http://localhost:${port}/api`);
  logger.log(`WebSocket available at ws://localhost:${port}`);
  logger.log(`Health check: http://localhost:${port}/api/health`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
