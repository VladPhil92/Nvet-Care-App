# Bootstrap a Producción — Nvet Care Backend
> Guía secuencial para resolver los **3 bloqueantes operacionales** y poner el backend en staging/producción de forma confiable.

## Pre-requisitos
- Node.js 18+ (Mail driver SendGrid usa `fetch` nativo)
- PostgreSQL 14+ (idealmente 15) con TLS habilitado
- Cuenta en uno de:
  - SendGrid (recomendado, tier gratis 100 emails/día)
  - AWS SES (más complejo, requiere validación de dominio)
  - SMTP genérico
- Plataforma de hosting: Railway, Render, Fly.io, AWS ECS, etc.

---

## Bloqueante 1 — Generar y persistir secrets
1. **Generar localmente** (sin commitear):
   ```bash
   cd backend
   npm run secrets:generate > .env.secrets
   ```
   Esto crea 4 secrets:
   - `JWT_SECRET` (32 bytes hex)
   - `JWT_REFRESH_SECRET` (32 bytes hex, distinto al anterior)
   - `TWO_FACTOR_ENCRYPTION_KEY` (32 bytes hex, AES-256-GCM)
   - `SESSION_ID_SALT` (16 bytes hex)
2. **Cargar en el secret manager** del provider (NO en `.env` plano en prod):
   - **Railway**: `railway variables set JWT_SECRET=...`
   - **Vercel**: `vercel env add JWT_SECRET production`
   - **AWS**: `aws secretsmanager create-secret --name nvet/jwt-secret --secret-string ...`
   - **GitHub Actions** (para CI): `gh secret set JWT_SECRET --body=...`
3. **Eliminar el archivo local** tras cargar:
   ```bash
   rm .env.secrets
   ```
4. **Validar** desde el servicio (sin imprimir el valor):
   ```bash
   railway run --service backend node -e "console.log('JWT_SECRET length:', process.env.JWT_SECRET?.length)"
   # Debe imprimir: JWT_SECRET length: 64
   ```
5. **Documentar la rotación** en runbook: JWT cada 90 días, encryption key anual.

---

## Bloqueante 2 — Migración Prisma
Existen dos rutas según si el ambiente ya tiene datos:
### Ruta A — Ambiente nuevo (sin datos)
```bash
cd backend
# 1. Generar Prisma Client desde el schema actualizado
npm run prisma:generate

# 2. Crear y aplicar la migración con nombre canónico
npm run prisma:migrate:hardening

# Esto creará:  prisma/migrations/YYYYMMDDHHMMSS_auth_hardening_v2/migration.sql
# y la aplicará a la DB definida en DATABASE_URL.
```
### Ruta B — Ambiente con datos (rolling deploy)
```bash
# 1. Conectar como superuser a la DB de producción
psql "$DATABASE_URL"

# 2. Aplicar el SQL idempotente en una transacción
\i backend/prisma/migrations/manual/auth_hardening_v2.sql

# 3. Validar (queries al final del SQL)
SELECT COUNT(*) FROM information_schema.columns
  WHERE table_name = 'users'
  AND column_name IN ('email_verified','two_factor_enabled','locked_until');
-- Debe retornar 3

# 4. Regenerar Prisma Client en el ambiente de build
npm run prisma:generate

# 5. Marcar la migration como aplicada en _prisma_migrations
#    (evita que prisma migrate deploy intente re-correrla)
npx prisma migrate resolve --applied auth_hardening_v2
```
### Rollback
Si algo falla durante la migración:
```sql
ROLLBACK;  -- automático si la transacción falló
-- Para revertir manualmente columnas ya commiteadas:
ALTER TABLE "users" DROP COLUMN IF EXISTS "two_factor_secret";
DROP TABLE IF EXISTS "user_sessions" CASCADE;
DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "idempotency_keys" CASCADE;
DROP TYPE IF EXISTS "AuditAction" CASCADE;
DROP TYPE IF EXISTS "AuditSeverity" CASCADE;
```

---

## Bloqueante 3 — Email provider
### Opción A — SendGrid (recomendado)
1. Crear cuenta en https://signup.sendgrid.com — selecciona tier "Free 100/day".
2. **Verificar el remitente**: Settings → Sender Authentication → Single Sender Verification (rápido) o Domain Authentication (recomendado).
3. **Generar API key**: Settings → API Keys → Create → "Restricted Access" con solo `Mail Send` habilitado.
4. **Cargar variables**:
   ```env
   MAIL_DRIVER=sendgrid
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   MAIL_FROM=no-reply@nvetcare.co
   MAIL_FROM_NAME=Nvet Care
   FRONTEND_URL=https://app.nvetcare.co
   ```
5. **Test smoke**: registrar un usuario de prueba y verificar que llega el email de verificación.
6. **Validar deliverability**: enviar a Gmail/Outlook y revisar que NO caiga en spam (depende de SPF/DKIM/DMARC del dominio).
### Opción B — AWS SES
Requiere `npm install @aws-sdk/client-ses` y reemplazar `sendViaSes()` en `mail.service.ts` por el código documentado en el comentario JSDoc del método.
### Opción C — SMTP genérico
Requiere `npm install nodemailer` y reemplazar `sendViaSmtp()` similarmente.

### Driver de fallback
Si por alguna razón el provider real falla, `MailService.send()` retorna `{ ok: false, error }` y el flujo de auth/verificación NO falla — solo loggea WARN. Esto mitiga outages del provider.

---

## Verificación post-deploy (smoke tests)
1. **Health check**:
   ```bash
   curl https://api.nvetcare.co/health/ready
   # Esperado: { "status": "ok", "checks": { "db": "ok", ... } }
   ```
2. **Registro + verificación de email**:
   ```bash
   # 1. Registrar
   curl -X POST https://api.nvetcare.co/auth/register \
     -H 'Content-Type: application/json' \
     -d '{"email":"smoke@nvetcare.co","password":"S3curePass!2026X","firstName":"Smoke","lastName":"Test"}'
   # Esperado: 201 + { user, accessToken, refreshToken, requiresEmailVerification: true }

   # 2. El usuario debe recibir el email de verificación (revisar bandeja)
   # 3. Solicitar nuevo email (autenticado):
   curl -X POST https://api.nvetcare.co/auth/send-verification-email \
     -H "Authorization: Bearer $ACCESS_TOKEN"
   # Esperado: 200 + { message, expiresInHours: 24 }
   ```
3. **POST /appointments sin verificar email**:
   ```bash
   curl -X POST https://api.nvetcare.co/appointments \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -d '{ ... }'
   # Esperado: 403 EMAIL_NOT_VERIFIED
   ```
4. **Verificar email + retry POST /appointments**:
   ```bash
   curl -X POST https://api.nvetcare.co/auth/verify-email \
     -d '{"token":"<userId>.<token-from-email>"}'
   # Esperado: 200 + { message, emailVerified: true }
   # Reintentar POST /appointments → ahora 201
   ```
5. **2FA flow**:
   ```bash
   curl -X POST https://api.nvetcare.co/auth/2fa/enroll \
     -H "Authorization: Bearer $ACCESS_TOKEN"
   # Esperado: 200 + { secret, otpauthUrl, encryptedSecret }
   # Escanear el otpauthUrl en Google Authenticator
   # Confirmar con el primer código de 6 dígitos:
   curl -X POST https://api.nvetcare.co/auth/2fa/confirm \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -d '{"encryptedSecret":"...","code":"123456"}'
   # Esperado: 200 + { recoveryCodes: [...10] }
   ```
6. **Lockout brute force**: intentar 5 logins con password incorrecto.
   ```bash
   for i in {1..5}; do
     curl -X POST https://api.nvetcare.co/auth/login \
       -d '{"email":"smoke@nvetcare.co","password":"wrong"}'
   done
   # Sexto intento: 403 "Cuenta bloqueada por intentos fallidos. Reintenta en 15 minutos..."
   ```
7. **Audit log**: validar que las acciones quedaron registradas:
   ```sql
   SELECT action, severity, created_at FROM audit_logs
     WHERE actor_id = (SELECT id FROM users WHERE email='smoke@nvetcare.co')
     ORDER BY created_at DESC LIMIT 10;
   -- Debe ver: REGISTER_SUCCESS, EMAIL_VERIFICATION_SENT, EMAIL_VERIFIED,
   --          LOGIN_SUCCESS, LOGIN_FAILED (x5), LOGIN_LOCKED, etc.
   ```

---

## Checklist final
- [ ] Secrets cargados en secret manager (no en `.env`)
- [ ] Migración Prisma aplicada (vía `prisma migrate deploy` o SQL manual)
- [ ] `npm run prisma:generate` ejecutado en build
- [ ] `MAIL_DRIVER=sendgrid` + API key configurada
- [ ] Sender verificado en SendGrid (single sender o domain)
- [ ] `FRONTEND_URL` apunta al dashboard real (links de email)
- [ ] CORS configurado con dominios de producción
- [ ] Sentry DSN configurado (opcional pero recomendado)
- [ ] Redis configurado (opcional pero recomendado para multi-instance)
- [ ] Smoke tests 1-7 pasan
- [ ] DB tiene backups automáticos (provider-specific)
- [ ] Logs estructurados ingeridos por servicio de observabilidad

---

## Troubleshooting
| Síntoma | Causa probable | Fix |
|---|---|---|
| `MailService initialized: driver=console` en prod | Variable `MAIL_DRIVER` no setteada | Agregar `MAIL_DRIVER=sendgrid` |
| `MAIL_DRIVER=sendgrid pero SENDGRID_API_KEY no está configurado` | Falta API key | Cargar `SENDGRID_API_KEY` |
| 401 al hacer login con password correcto | `passwordChangedAt > iat` del JWT viejo | Re-login para emitir token nuevo |
| 403 en `POST /appointments` | Email no verificado | Pedir verificación, click en link |
| `prisma migrate deploy` falla con "AuditAction already exists" | Migration v1 + v2 duplicadas | Usar SQL manual idempotente |
| Email no llega | Sender no verificado en SendGrid | Verificar dominio o single sender |
| Email cae en spam | Falta SPF/DKIM/DMARC en el dominio | Configurar registros DNS según docs SendGrid |
