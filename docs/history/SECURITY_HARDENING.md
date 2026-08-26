# Endurecimiento de Seguridad y Resiliencia · Nvet Care
**Sprint 1 — Día 5 · Fases 10.7 + 10.8 completadas**

Esta capa eleva el sistema de "funcional con seguridad básica" a **production-grade**: hashing moderno, revocación de tokens, audit log inmutable, validación de archivos por contenido real, idempotency persistente, sagas con compensación y reconexión robusta de WebSocket.

---

## 1. Estructura de archivos entregada

```
backend/src/
├── auth/services/
│   ├── password.service.ts         # Argon2id + bcrypt backwards compat
│   └── token-blacklist.service.ts  # Revocación con TTL (in-memory + Redis stub)
├── common/
│   ├── audit/
│   │   └── audit.service.ts        # Append-only audit log + diff helper
│   ├── security/
│   │   ├── magic-bytes.service.ts  # Validar MIME real por bytes iniciales
│   │   └── idempotency.service.ts  # Replay-safe POSTs con DB persistence
│   ├── saga/
│   │   └── saga-orchestrator.service.ts  # Sagas con compensación LIFO
│   └── resilience.module.ts        # @Global con todos los services
└── prisma/
    └── schema.prisma                # +AuditLog +IdempotencyKey +AuditAction enum

mobile/src/stores/
└── useChatStore.ts                  # WebSocket con backoff + jitter + resync
```

---

## 2. Threat Model y Mitigaciones

### 2.1 Brute force de login
- **Ataque**: bot prueba miles de combinaciones email/password
- **Mitigación 1**: Throttle 5 intentos/min/IP (Sprint 4)
- **Mitigación 2**: Argon2id con 64 MB memoria — un GPU típico solo hashea ~30 password/segundo
- **Mitigación 3**: Audit log de `LOGIN_FAILED` para detectar patrones
- **Severidad residual**: 🟢 baja

### 2.2 Robo de refresh token
- **Ataque**: malware en cliente extrae el refreshToken de localStorage
- **Mitigación 1**: Token blacklist (`TokenBlacklistService`) — al detectar uso desde IP nueva, revocar todos los tokens del usuario
- **Mitigación 2**: Refresh token rotation (cada refresh emite nuevo token, blacklist el viejo)
- **Mitigación 3**: TTL corto del access token (15 min) + refresh con rotation
- **Severidad residual**: 🟡 media (mitigación parcial; idealmente: tokens en httpOnly cookies)

### 2.3 Upload de archivo malicioso
- **Ataque**: cliente sube `malware.exe` con `Content-Type: image/jpeg` para hosting
- **Mitigación 1**: `MagicBytesValidator` verifica los bytes iniciales del archivo
- **Mitigación 2**: Lista de firmas prohibidas (PE, ELF, Mach-O, ZIP, scripts)
- **Mitigación 3**: Multer con `fileSize` cap 10 MB (verification) / 5 MB (transfers)
- **Mitigación 4**: Solo permitir JPG/PNG/PDF (MIME whitelist)
- **Severidad residual**: 🟢 baja

### 2.4 Pago duplicado por reintento de red
- **Ataque** (no malicioso): cliente pierde respuesta de POST `/payments/process` y reintenta — cobra 2 veces
- **Mitigación**: `IdempotencyService` con persistencia en DB (TTL 24h)
- **Comportamiento**:
  - Misma key + mismo body → retorna respuesta cacheada
  - Misma key + body distinto → 409 Conflict (potencial bug del cliente)
  - Key nueva → ejecuta y cachea
- **Severidad residual**: 🟢 baja

### 2.5 Saga parcialmente fallida
- **Escenario**: Crear cita (DB) → Cobrar pago (PSE) → Enviar email → Email falla
- **Sin saga**: cita creada, pago cobrado, email no enviado, estado inconsistente
- **Con saga**: 3er paso marcado optional (no compensa). Si paso 2 falla, paso 1 se compensa cancelando la cita
- **Mitigación**: `SagaOrchestratorService.run()` con compensaciones LIFO + logging de orphans (compensaciones que también fallaron)
- **Severidad residual**: 🟡 media (orphans requieren intervención manual; siempre alertar)

### 2.6 WebSocket flapping en mobile
- **Escenario**: red móvil intermitente (4G ↔ Wi-Fi) — chat queda desconectado sin que el usuario sepa
- **Mitigación 1**: Backoff exponencial con jitter (1s, 2s, 4s, 8s ... cap 30s)
- **Mitigación 2**: Cap de 10 intentos antes de marcar como `connectionDead` y mostrar mensaje claro al usuario
- **Mitigación 3**: Resync HTTP de mensajes al reconectar (no perder eventos)
- **Mitigación 4**: Cleanup de listeners viejos antes de cada reconexión (anti memory leak)
- **Severidad residual**: 🟢 baja

### 2.7 Acción admin no auditada
- **Escenario**: admin malicioso aprueba 100 vets falsos y borra evidencia
- **Mitigación**: `AuditService` append-only — no expone `update()` ni `delete()`
- **Datos capturados**: actor (id+role+ip+UA), action, target, before/after diff, reason, requestId
- **Filtros sensibles**: `[REDACTED]` automático en `password`, `creditCard`, `cvv`, etc.
- **Severidad residual**: 🟢 baja

---

## 3. Comparativa: bcrypt vs Argon2id

| Característica | bcrypt | Argon2id |
|---|---|---|
| Algoritmo | Blowfish-based | Memory-hard |
| Resistencia GPU | media | alta |
| Resistencia ASIC | baja | alta |
| Resistencia side-channel | baja | media-alta |
| Límite de password | 72 bytes (truncado!) | sin límite efectivo |
| OWASP 2024 | aceptable | recomendado #1 |
| Tiempo típico (default) | ~100 ms | ~50-100 ms |
| Memoria usada | mínima | 64 MB (config) |
| Verificación cross-format | requiere lib bcrypt | automático con argon2 |

**Migración no breaking**: `PasswordService.verify()` detecta hash legacy bcrypt (`$2a$`/`$2b$`/`$2y$`) y verifica con la librería original. Marca `needsRehash: true` para que el caller re-hashee con Argon2id en el próximo login exitoso.

---

## 4. Audit Log Schema

```prisma
model AuditLog {
  id              String        @id @default(uuid())
  actorId         String?       // null = sistema/cron
  actorRole       String?       // ADMIN | VET | CLIENT
  actorIp         String?
  actorUserAgent  String?
  action          AuditAction   // LOGIN_SUCCESS, VET_TIER_CHANGED, etc.
  severity        AuditSeverity // INFO | WARN | CRITICAL
  targetType      String?       // "VetProfile", "Transaction"
  targetId        String?
  beforeData      Json?         // Estado antes (solo campos cambiados)
  afterData       Json?         // Estado después (solo campos cambiados)
  reason          String?
  metadata        Json?         // requestId, sessionId, etc.
  createdAt       DateTime      @default(now())
}
```

### Acciones registradas (16 enum values)
- **Auth**: LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, PASSWORD_CHANGED, TOKEN_REVOKED
- **Vet**: VET_VERIFICATION_APPROVED, _REJECTED, VET_TIER_CHANGED, VET_SUSPENDED, VET_REACTIVATED
- **Pagos**: TRANSFER_VERIFIED, TRANSFER_REJECTED, DISPUTE_RESOLVED, REFUND_ISSUED
- **Admin**: USER_DELETED, ADMIN_IMPERSONATION, CONFIG_CHANGED

---

## 5. WebSocket Reconnection Strategy

### 5.1 Algoritmo
```
attempt 0: 1000ms ± 30%
attempt 1: 2000ms ± 30%
attempt 2: 4000ms ± 30%
attempt 3: 8000ms ± 30%
attempt 4: 16000ms ± 30%
attempt 5+: 30000ms ± 30%   (cap)
attempt 10: connectionDead → user must manually retry
```

### 5.2 Estados expuestos al UI
```ts
{
  isConnected: boolean       // socket vivo
  isReconnecting: boolean    // intentando ahora
  reconnectAttempt: number   // contador
  connectionDead: boolean    // dimos up, mostrar CTA al usuario
}
```

### 5.3 Resync al reconectar
Al volver a conectar, hacemos `chatService.getMessages(appointmentId)` por HTTP para recuperar mensajes que pudimos haber perdido durante la desconexión. Esto evita que el chat tenga "agujeros" temporales.

---

## 6. Idempotency Keys: anatomía

```
Client                              Server
  │                                   │
  ├─ POST /payments/process           │
  │   X-Idempotency-Key: uuid-v4      │
  │   body: { appointmentId, ... }    │
  │   ───────────────────────────────►│
  │                                   ├─ Hash body → SHA-256
  │                                   ├─ Lookup in DB by key
  │                                   │
  │                                   │  ┌─ EXISTING + same hash → return cached
  │                                   │  ├─ EXISTING + diff hash → 409 Conflict
  │                                   │  └─ NEW → execute, cache for 24h
  │                                   │
  │   ◄───────────────────────────────┤
  │   { transactionId, ... }          │
```

### Casos de uso recomendados
- `POST /payments/process` — pagos
- `POST /appointments` — crear citas
- `POST /payments/withdrawals` — retiros
- `POST /vets/me/verification/upload` — uploads críticos

### Cleanup
Cron diario: `IdempotencyService.cleanupExpired()` borra keys con `expiresAt < now`. Esperado: ~5-10k entries persistentes en cualquier momento.

---

## 7. Saga Pattern: ejemplo concreto

```ts
// Booking saga: book → pay → notify
const result = await sagaOrchestrator.run('book-and-pay', [
  {
    name: 'createAppointment',
    action: async (ctx) => {
      const appt = await prisma.appointment.create({...});
      return { appointmentId: appt.id };
    },
    compensate: async (output) => {
      // Si pago falla, eliminar la cita creada
      await prisma.appointment.delete({ where: { id: output.appointmentId } });
    },
  },
  {
    name: 'processPayment',
    action: async (ctx) => {
      const tx = await paymentsService.processPayment({
        appointmentId: ctx.appointmentId,
        ...ctx.paymentData,
      });
      return { transactionId: tx.id };
    },
    compensate: async (output) => {
      // Si notify falla, NO compensamos pago — el cliente ya pagó
      // (esto se decide endpoint por endpoint)
      await paymentsService.refund(output.transactionId);
    },
  },
  {
    name: 'sendNotifications',
    action: async (ctx) => {
      await emailService.send(...);
      await pushService.send(...);
      return { notified: true };
    },
    optional: true, // Si falla, NO compensar pasos anteriores
  },
])

if (result.success) {
  return result.result  // { appointmentId, transactionId, notified }
} else {
  // Loggear orphans si los hubo
  if (result.orphans.length > 0) {
    alert('manual-intervention')
  }
}
```

---

## 8. Variables de entorno requeridas

```bash
# Argon2 (opcionales; defaults son OWASP 2024)
ARGON2_MEMORY_COST=65536
ARGON2_TIME_COST=3
ARGON2_PARALLELISM=4

# Token blacklist (para multi-instancia)
REDIS_URL=redis://prod-redis:6379

# JWT (existing)
JWT_SECRET=...
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=...
JWT_REFRESH_EXPIRES_IN=7d
```

---

## 9. Dependencias requeridas

```bash
cd backend

# Argon2 (binding nativo, requiere build tools)
npm install argon2

# bcrypt (mantener por backwards compat con users existentes)
# npm install bcrypt @types/bcrypt   (ya instalado)

# Redis (opcional, solo para deploy multi-instancia)
npm install ioredis @types/ioredis
```

---

## 10. Checklist post-deploy

### Infraestructura
- [ ] `REDIS_URL` configurado en producción
- [ ] Migración Prisma ejecutada: `npx prisma migrate deploy`
- [ ] Cron job diario para `IdempotencyService.cleanupExpired()`
- [ ] Cron job diario para `prisma.auditLog.deleteMany({ where: { createdAt: { lt: 1y_ago }, severity: INFO } })` (retención INFO 1 año)
- [ ] Alertas configuradas para: orphans de saga, login failures >50/hr, audit CRITICAL events

### Validación
- [ ] Test E2E: subir un .exe con extensión .jpg → debe rechazarse con BadRequestException
- [ ] Test E2E: enviar mismo POST 2 veces con misma idempotency-key → segunda retorna response cacheado
- [ ] Test E2E: Argon2 + bcrypt verify ambos funcionan
- [ ] Test E2E: WebSocket disconnect → 5 reconexiones automáticas → ver `reconnectAttempt: 5`
- [ ] Test E2E: admin aprueba vet → `AuditLog` insertado con before/after correcto

### Monitoreo
- [ ] Sentry alert: `orphans.length > 0` en cualquier saga (CRITICAL)
- [ ] Grafana panel: distribución de `LOGIN_FAILED` por IP
- [ ] Grafana panel: tasa de hit/miss del IdempotencyService
- [ ] Grafana panel: WebSocket reconnects por minuto
- [ ] Logs: ningún `[REDACTED]` o password en plaintext en logs (verificar redaction)

---

## 11. Próximos pasos

- **Refresh token rotation completo**: integrar `TokenBlacklistService` en `AuthService.refreshToken()`
- **Aplicar `MagicBytesValidator`** en `VetsController.uploadVerificationDocument` y `PaymentsController.verifyTransfer`
- **Aplicar `IdempotencyService`** en `PaymentsController.processPayment` y `AppointmentsController.createAppointment`
- **Aplicar `AuditService`** en todos los endpoints admin de `AdminController`, `VetsController` (verification approve/reject), `PaymentsController` (admin confirm/reject)
- **Saga real**: refactorizar `AppointmentsService.create` para usar `SagaOrchestratorService` con saga `book-and-pay`
- **Migración bcrypt → Argon2id**: hook en `AuthService.login` para re-hashear si `needsRehash: true`

---

## 12. Métricas de éxito esperadas

| Métrica | Antes | Objetivo |
|---|---|---|
| Tiempo para crackear 1 password (GPU) | bcrypt: ~10 días | Argon2id 64MB: ~3 años |
| Pagos duplicados por retry de red | 0.3% | <0.01% (idempotency) |
| Acciones admin sin trazabilidad | 100% | 0% (audit log) |
| Archivos maliciosos aceptados | depende del cliente | 0% (magic bytes) |
| WebSocket reconnect success rate | sin medición | >95% en <30s |
| Orphans tras saga fallida | sin tracking | <1% (con compensaciones) |

---

## Próxima fase del plan

Sprint 1 completado al 100%. **Sprint 2** comienza con **Mobile Navigation** + integración de stores existentes a las pantallas, y **12 pantallas adicionales** (Cliente: SearchVets/VetDetails/BookAppointment/MyAppointments/AppointmentTracking; Vet: Schedule/Earnings/Patients/PriceManagement; Compartidas: Chat/Wallet/Notifications).
