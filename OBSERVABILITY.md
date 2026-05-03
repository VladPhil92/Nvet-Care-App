# Observabilidad y Performance · Backend Nvet Care
**Sprint 1 — Día 4 · Fases 10.5 + 10.6 completadas**

Esta capa transforma el backend de "funcional" a "operable en producción": logs estructurados, traces, métricas, alertas y health checks.

---

## 1. Estructura de archivos entregada

```
backend/src/
├── main.ts                                  # Bootstrap endurecido
├── common/
│   ├── common.module.ts                     # @Global con filters + interceptors + middleware
│   ├── filters/
│   │   └── all-exceptions.filter.ts         # Normaliza errores + Sentry
│   ├── interceptors/
│   │   └── logging.interceptor.ts           # Slow request logger
│   ├── middlewares/
│   │   └── request-id.middleware.ts         # X-Request-Id correlación
│   ├── logger/
│   │   └── pino.config.ts                   # Pino + redaction de PII
│   ├── sentry/
│   │   └── sentry.config.ts                 # Init lazy + captureException helper
│   └── throttler/
│       └── throttler.config.ts              # Multi-tier rate limiting + decorators
├── health/
│   ├── health.module.ts
│   ├── health.controller.ts                 # /health, /health/live, /health/ready
│   └── health.service.ts                    # DB ping, memory, uptime
└── auth/
    └── auth.controller.ts                   # @Throttle estricto en login/register
```

---

## 2. Capas de defensa

### 2.1 Network layer (helmet + CORS + trust proxy)
| Header | Valor | Propósito |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'`, frame-ancestors none | XSS, clickjacking |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forzar HTTPS 1 año |
| `X-Frame-Options` | DENY | Anti-clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Privacy |
| `Cross-Origin-Resource-Policy` | `same-site` | Aislamiento |

### 2.2 Application layer (throttler + validation)
| Endpoint | Rate Limit | Razón |
|---|---|---|
| Global default | 200 req/min/IP | Anti-scraping general |
| `POST /auth/login` | 5/min | Anti brute force |
| `POST /auth/register` | 5/min | Anti spam de cuentas |
| `POST /auth/refresh` | 20/min | Refresh tokens son frecuentes pero legítimos |
| Burst protection | 10 req/s | Anti rapid fire |

### 2.3 Data layer (validation pipe + DTO + Prisma)
- `ValidationPipe` global con `whitelist + forbidNonWhitelisted + transform`
- `class-validator` en todos los DTOs
- Prisma error mapping → códigos HTTP semánticos (P2002 → 409, P2025 → 404)

---

## 3. Logging estructurado (pino)

### 3.1 Formato de log en producción
```json
{
  "level": 30,
  "time": "2026-04-30T00:15:42.123Z",
  "pid": 12345,
  "hostname": "api-pod-3",
  "req": {
    "id": "9f3b5719-1479-4357-8ac4-6d0e85c9e8fe",
    "method": "POST",
    "url": "/api/payments/process",
    "remoteAddress": "201.245.x.x",
    "userAgent": "Nvet-Mobile/1.0.0"
  },
  "userId": "uuid-v4",
  "userRole": "CLIENT",
  "responseTime": 142,
  "msg": "POST /api/payments/process 201 (142ms)"
}
```

### 3.2 Auto-redaction (no se loggean):
- `req.headers.authorization`
- `req.headers.cookie`
- `*.password`, `*.passwordHash`
- `*.refreshToken`, `*.accessToken`
- `*.creditCard`, `*.cvv`, `*.ssn`
- `*.documentId`

### 3.3 Niveles
| Nivel | Cuándo |
|---|---|
| `fatal` | Imposible continuar, requiere shutdown |
| `error` | 5xx, excepciones no manejadas, DB caída |
| `warn` | 4xx, slow requests >500ms, validation fail |
| `info` | Lifecycle, requests exitosos, audit events |
| `debug` | Solo en `NODE_ENV=development` |
| `trace` | Solo activado manualmente con `LOG_LEVEL=trace` |

---

## 4. Health checks (Kubernetes-ready)

### 4.1 Endpoints
```
GET /api/health        → Alias de /ready (200 si OK, 503 si DOWN)
GET /api/health/live   → Liveness (proceso vivo, sin deps)
GET /api/health/ready  → Readiness (DB ping + memory)
```

### 4.2 Respuesta típica `/health/ready`
```json
{
  "status": "ok",
  "timestamp": "2026-04-30T00:15:42.123Z",
  "uptimeSeconds": 3641,
  "version": "1.0.0",
  "environment": "production",
  "checks": {
    "database": { "status": "up", "latencyMs": 8 },
    "memory": {
      "status": "up",
      "details": { "heapUsedMB": 92, "heapTotalMB": 180, "rssMB": 245, "utilizationPct": 51 }
    }
  }
}
```

### 4.3 K8s probe config recomendada
```yaml
livenessProbe:
  httpGet: { path: /api/health/live, port: 3000 }
  periodSeconds: 30
  failureThreshold: 3
readinessProbe:
  httpGet: { path: /api/health/ready, port: 3000 }
  periodSeconds: 10
  failureThreshold: 2
  timeoutSeconds: 3
```

---

## 5. Sentry

### 5.1 Configuración por entorno
| Variable | Producción | Staging | Dev |
|---|---|---|---|
| `tracesSampleRate` | 0.1 (10%) | 0.5 (50%) | 1.0 (100%) |
| `profilesSampleRate` | 0.1 | 0.1 | 0 |
| `sendDefaultPii` | false | false | false |

### 5.2 Filtros aplicados
- 4xx (excepto 401/403) → no se reportan (cliente fault)
- 401/403 → se reportan (detectar attacks)
- 5xx → siempre se reportan
- Headers `authorization` y `cookie` → eliminados antes del envío

### 5.3 Contexto enriquecido automático
Cada `captureException` incluye:
- `user.id`, `user.email` (si JWT presente)
- `tags`: method, url
- `extra`: requestId

---

## 6. Request correlation

### 6.1 Flow del request-id
```
Cliente envía X-Request-Id           (opcional)
     ↓
RequestIdMiddleware genera UUID si no viene
     ↓
pino-http usa el id en cada log
     ↓
Filter de excepciones lo incluye en respuesta JSON
     ↓
Response header X-Request-Id refleja el id
     ↓
Cliente lo loggea en su lado (Mobile / Dashboard)
```

### 6.2 Búsqueda end-to-end
Con un solo `requestId`, se puede correlacionar:
- Logs del frontend (`getErrorMessage` lo loggea)
- Logs del backend (pino lo incluye en cada línea)
- Eventos de Sentry (lo agrega como `extra.requestId`)
- Tracing distribuido (Sentry Performance, OpenTelemetry futuro)

---

## 7. Alertas recomendadas (Sentry)

| Alerta | Trigger | Severidad |
|---|---|---|
| Error rate >0.5% en 5min | sustained 5xx | 🔴 page on-call |
| p95 latency >2s en 10min | slow API | 🟡 notify slack |
| DB ping fail | health-check `/ready` 503 | 🔴 page on-call |
| Heap utilization >85% sostenido | memory leak | 🟡 notify |
| Login attempts >50/min misma IP | brute force | 🔴 block IP |
| Unique users registered >100/h | spam wave | 🟡 review |

---

## 8. Performance optimizations aplicadas (Fase 10.5)

| Optimización | Implementación | Impacto esperado |
|---|---|---|
| Compression gzip/brotli | level 6, threshold 1 KB | -60% tamaño body |
| Body limits | 1 MB JSON | Anti DoS |
| Trust proxy | `set('trust proxy', 1)` | Throttler usa IP real |
| Connection pooling | Prisma `connection_limit=10` | Menos conexiones DB |
| Índices compuestos | 7 índices en schema | Queries 10-100x más rápidas |
| Pagination obligatoria | limit max 100 | Anti memory bloat |
| Slow request logger | warn si >500 ms | Detectar bottlenecks |

---

## 9. Variables de entorno requeridas

```bash
# Logging
NODE_ENV=production              # production | staging | development
LOG_LEVEL=info                   # fatal | error | warn | info | debug | trace
APP_VERSION=1.0.0                # se incluye en cada log y en Sentry release

# Sentry (opcional; si no se setea, todo el SDK es no-op)
SENTRY_DSN=https://...@sentry.io/...

# Server
PORT=3000
FRONTEND_URL=https://app.nvetcare.co

# Database
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=10"

# JWT
JWT_SECRET=...
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=...
JWT_REFRESH_EXPIRES_IN=7d
```

---

## 10. Dependencias requeridas

```bash
cd backend

# Logging
npm install nestjs-pino pino pino-http
npm install -D pino-pretty       # solo dev

# Rate limiting
npm install @nestjs/throttler

# Security
npm install helmet compression
npm install -D @types/compression

# Sentry (opcional)
npm install @sentry/node
```

---

## 11. Métricas de éxito esperadas (post-deploy)

| Métrica | Antes | Objetivo |
|---|---|---|
| p95 latency API | sin medición | <500 ms |
| Error rate (5xx) | sin medición | <0.5% |
| Uptime SLO | sin medición | 99.9% (43 min/mes downtime) |
| Mean time to detection | sin alertas | <2 min |
| Tamaño promedio body response | sin compress | -60% con gzip |
| Brute force success rate | sin throttle | 0% (bloqueado a los 5 intentos) |
| PII leak en logs | riesgo alto | 0 (auto-redaction) |

---

## 12. Próximos pasos (fuera de este sprint)

- **OpenTelemetry**: traces distribuidos para flujos críticos (booking → payment → liquidation)
- **Prometheus exporter**: métricas RED (Rate, Errors, Duration) en `/metrics`
- **Grafana dashboard**: paneles para SLOs y alertas
- **Loki / Datadog**: agregación de logs estructurados
- **Audit log**: tabla `AuditLog` para acciones admin (verifyVet, resolveDispute)
- **Refresh token rotation + blacklist**: Redis con TTL = remaining lifetime

---

## Próxima Fase del Plan

**Sprint 1 — Día 5**: Seguridad endurecida + Resiliencia (Fases 10.7 + 10.8)
- Argon2 en lugar de bcrypt
- Refresh token rotation + blacklist en Redis
- Audit log para acciones admin
- WebSocket reconnection con backoff exponencial
- Idempotency keys persistentes en `/payments/process` y `/appointments`
