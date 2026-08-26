# Nvet Care — Production Roadmap v1.0

**Baseline:** `main` @ `643b7e5` (merge de PR #19 — decisión de plataforma web canónica)
**Revisión:** 2026-08-26 (actualizada tras verificación en vivo de Fase 9 y conexión de Railway)

Este roadmap sustituye el roadmap histórico del README. Su objetivo es llevar el producto actual a un release real y verificable. La revisión anterior (baseline `30252c9c`) quedó desactualizada varios merges atrás — este estado está verificado contra CI, workflows y el árbol de archivos reales en la fecha de revisión, no reconstruido de memoria.

## Plataformas y arquitectura de producto

Decisión de producto (2026-08-26): **la única plataforma web de Nvet Care es `ctgone.com/nvetcareapp`**, implementada en el repo `ctg_one_website` (Next.js, `src/app/nvetcareapp/**` + `src/app/api/nvetcareapp/**` como BFF contra el `backend/` de este repo). Todo desarrollo web de Nvet Care se orienta a vivir ahí.

Consecuencias concretas para este repo:

- El paquete `dashboard/` (Vite + React, "Admin SaaS Dashboard" standalone) queda **deprecado como plataforma web**. Duplicaba superficie ya cubierta por `ctgone.com/nvetcareapp` (login, veterinarios, transacciones, disputas, transferencias, contabilidad, chat), construida por separado sin que ninguna de las dos supiera de la otra. No se elimina el código todavía — puede contener lógica de referencia útil — pero no se despliega ni se desarrolla más como producto.
- `.github/workflows/deploy-dashboard.yml` se retira en consecuencia (ver más abajo) — desplegarlo a Vercel construiría una segunda plataforma web que la decisión de producto descarta explícitamente.
- Próximo hito de plataforma: apps nativas Android/iOS (paquete `mobile/`, Fase 2/13/14) — **deben sincronizar contra el mismo `backend/`** que ya consume `ctgone.com/nvetcareapp`, no contra una API o modelo de datos aparte. `backend/` es la única fuente de verdad de dominio, compartida por la web (`ctgone.com`) y por el futuro móvil.

## Estado por fase

| Fase | Objetivo | Estado |
|---|---|---|
| 0 | Consolidación del repositorio | COMPLETA — pendiente reverificar ausencia de secretos |
| 1 | Baseline técnico + CI verde | COMPLETA |
| 2 | Build móvil nativo Android/iOS | PARCIAL — Android avanzado, iOS no iniciado |
| 3 | Infraestructura staging | PENDIENTE |
| 4 | Integración E2E del MVP | PARCIAL — specs existen, ejecución no confiable |
| 5 | Geolocalización/Cartagena | AVANZADA |
| 6 | Chat + notificaciones | PARCIAL — chat sí, push no |
| 7 | Pagos productivos | PARCIAL — dominio avanzado, rails externos pendientes |
| 8 | Dashboard operativo | REUBICADA — el dashboard web vive en `ctgone.com/nvetcareapp`, no en este repo |
| 9 | Seguridad/privacidad | AVANZADA — fix de ADMIN verificado en vivo en producción |
| 10 | Observabilidad/backups | PENDIENTE |
| 11 | Release Candidate | PENDIENTE |
| 12 | Beta cerrada Cartagena | PENDIENTE |
| 13 | Android Production | PENDIENTE — base técnica lista (signing template, `bundleRelease`) |
| 14 | iOS Production | PENDIENTE — bloqueada por Fase 2 |

## Fase 0 — Consolidación · COMPLETA

Criterios de salida:

- [x] arquitectura canónica documentada — `mobile`, `backend` (+ `dashboard` deprecado, ver arriba) como monorepo npm workspaces;
- [x] paquetes oficiales inequívocos;
- [x] documentación histórica separada de documentación vigente — los 17 archivos `*_AUDIT.md` / `*_COMPLETE.md` / `MOBILE_*.md` / etc. se movieron a `docs/history/` (PR #18).
- [ ] ausencia de secretos versionados — no reverificado en esta revisión.

## Fase 1 — Baseline técnico · COMPLETA

Confirmado en GitHub Actions (`ci.yml`, run #90 y posteriores):

```text
Backend      PASS
Mobile       PASS
Android Native (Gradle)  PASS
Dashboard    PASS
CI Success   PASS
```

Deuda conocida: no existe `package-lock.json` comprometido en el repo (ni raíz ni por paquete) — `ci.yml` ya lo resuelve usando `npm install` sin cache en vez de `npm ci`; `deploy-dashboard.yml` y `mobile-e2e.yml` recibieron el mismo fix en PR #16. Adoptar un lockfile canónico (y con eso instalación reproducible real + cache real) sigue siendo una decisión pendiente del equipo, no de este roadmap.

## Fase 2 — Mobile native · PARCIAL

- Android: `mobile/android` existe, compila en CI (`Android Native (Gradle)`), genera `app-debug.apk` + `app-debug-androidTest.apk`. Falta un AAB/APK **release** firmado con keystore productivo, probado en dispositivo físico — el criterio de salida sigue siendo ese, no un build debug.
- iOS: `mobile/ios` **no existe**. Detox y `mobile-e2e.yml` ya están configurados esperando `ios/NvetCare.xcworkspace` y `ios/Podfile.lock` — apuntan a un proyecto que aún no se ha creado.

## Fase 3 — Staging · PENDIENTE

No se encontró evidencia de un entorno de staging separado (DB, backend, dashboard, secrets propios) en el repositorio. `main` sigue siendo el único entorno de integración real.

## Fase 4 — MVP E2E · PARCIAL

Circuito obligatorio:

```text
registro → email → mascota → veterinario → cita → servicio → review
```

Existen 3 specs Detox reales (`login-search-book-pay`, `vet-receives-appointment`, `chat-reconnect`), pero `Mobile E2E` no ha completado una corrida exitosa: hasta PR #16 fallaba en la instalación de dependencias (lockfile inexistente); con eso corregido, el job iOS seguirá bloqueado por la Fase 2. Ninguna corrida registrada certifica hoy el circuito completo.

## Fase 5 — Geolocalización · AVANZADA

Cartagena como primera plaza operativa. `react-native-maps` y las dependencias de tracking en tiempo real (`socket.io-client`) ya están en `mobile/package.json`; geolocalización real, retención de coordenadas y permisos Android ya están implementados según el dominio del backend. Pendiente: validación en dispositivo físico, clave de Maps productiva y testing E2E sobre staging real.

## Fase 6 — Tiempo real · PARCIAL

Chat autorizado por cita: implementado, con test Detox de reconexión. Notificaciones push: **no implementadas** — no hay dependencia de FCM/APNs (`firebase`, `notifee` o equivalente) en `mobile/package.json`.

## Fase 7 — Pagos · PARCIAL

Prioridad: métodos tradicionales. CTG Token no debe bloquear el MVP. Dominio financiero (booking↔pago, idempotencia, PSE) avanzado; rails de pago productivos, webhooks externos y conciliación reales siguen pendientes de certificar contra un proveedor real o sandbox.

## Fases 8–10 — Operación

- **Fase 8 (Dashboard) — REUBICADA:** ver "Plataformas y arquitectura de producto" arriba. El dashboard operativo real es `ctgone.com/nvetcareapp` (repo `ctg_one_website`), ya en producción, con sesión, refresco de token, panel admin (veterinarios, transacciones, disputas, transferencias, contabilidad) y chat verificados contra el backend real. El paquete `dashboard/` de este repo queda deprecado; su workflow de deploy a Vercel se retiró — no tenía sentido corregirlo para desplegar una segunda plataforma web que la decisión de producto descarta.
- **Fase 9 (Seguridad) — AVANZADA:** el fix de escalación a rol ADMIN (PR #15) está verificado **en vivo en producción**, no solo en código: `POST https://backend-production-a476.up.railway.app/api/auth/register` con `role: "ADMIN"` responde `400 {"message":["Rol inválido"]}` — la validación de `RegisterDto` (`@IsIn([CLIENT, VET])`) rechaza la petición antes de tocar la base de datos, sin crear ningún usuario. Railway ahora tiene auto-deploy nativo conectado a `main` (antes no lo tenía — producción estuvo congelada más de un día en un commit anterior a este fix). `Deploy Backend` (GitHub Actions) sigue fallando por `DATABASE_URL` vacía en el environment `production`, pero ya no es la única vía de despliegue; sigue siendo necesario corregirlo porque es el único mecanismo que aplica los guards SQL manuales (`booking_integrity_v1.sql`, `live_location_v1.sql`) antes del deploy — a diferencia de `deploy-dashboard.yml`, no es redundante y no debe retirarse.
- **Fase 10 (Observabilidad/backups) — PENDIENTE:** sin evidencia de logging estructurado, alertas o backups verificados en esta revisión.

## Fases 11–14 — Release

RC sin bugs P0/P1 → beta controlada en Cartagena → Google Play → iOS/TestFlight/App Store. Ninguna de las cuatro ha comenzado formalmente.

## Regla de priorización

Hasta completar RC1:

1. P0: bloquea build, seguridad, datos o circuito E2E.
2. P1: bloquea operación comercial confiable.
3. P2: mejora producto pero puede salir después de 1.0.

No se incorporarán nuevas funcionalidades P2 mientras existan P0 abiertos de release.
