# Nvet Care — Production Roadmap v1.0

**Baseline:** `main` @ `31ace8b` (merge de PR #16, sobre PR #15 — fix de escalación a rol ADMIN)
**Revisión:** 2026-08-26

Este roadmap sustituye el roadmap histórico del README. Su objetivo es llevar el producto actual a un release real y verificable. La revisión anterior (baseline `30252c9c`) quedó desactualizada varios merges atrás — este estado está verificado contra CI, workflows y el árbol de archivos reales en la fecha de revisión, no reconstruido de memoria.

## Estado por fase

| Fase | Objetivo | Estado |
|---|---|---|
| 0 | Consolidación del repositorio | PARCIAL — deuda de limpieza documental |
| 1 | Baseline técnico + CI verde | COMPLETA |
| 2 | Build móvil nativo Android/iOS | PARCIAL — Android avanzado, iOS no iniciado |
| 3 | Infraestructura staging | PENDIENTE |
| 4 | Integración E2E del MVP | PARCIAL — specs existen, ejecución no confiable |
| 5 | Geolocalización/Cartagena | AVANZADA |
| 6 | Chat + notificaciones | PARCIAL — chat sí, push no |
| 7 | Pagos productivos | PARCIAL — dominio avanzado, rails externos pendientes |
| 8 | Dashboard operativo | PARCIAL — build y deploy funcionan, operación sin verificar |
| 9 | Seguridad/privacidad | PARCIAL — fix en código confirmado, estado en producción sin confirmar |
| 10 | Observabilidad/backups | PENDIENTE |
| 11 | Release Candidate | PENDIENTE |
| 12 | Beta cerrada Cartagena | PENDIENTE |
| 13 | Android Production | PENDIENTE — base técnica lista (signing template, `bundleRelease`) |
| 14 | iOS Production | PENDIENTE — bloqueada por Fase 2 |

## Fase 0 — Consolidación · PARCIAL

Criterios de salida:

- [x] arquitectura canónica documentada — `mobile`, `backend`, `dashboard` como monorepo npm workspaces;
- [x] paquetes oficiales inequívocos;
- [ ] documentación histórica separada de documentación vigente — siguen 17 archivos `*_AUDIT.md` / `*_COMPLETE.md` / `MOBILE_*.md` / etc. en la raíz del repo, sin mover a un directorio de histórico. No bloquea el runtime, pero es deuda pendiente antes del RC.
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

- **Fase 8 (Dashboard) — PARCIAL:** build y typecheck pasan en CI; `Deploy Dashboard` estaba roto el 100% de sus corridas por el mismo bug de lockfile que Fase 1, corregido en PR #16. Operación real (RBAC, auditoría admin, métricas) sin verificar en esta revisión.
- **Fase 9 (Seguridad) — PARCIAL:** el fix de escalación a rol ADMIN (PR #15) está en `main`, pero `Deploy Backend` nunca ha completado un despliegue exitoso registrado (falla por `DATABASE_URL` vacía en el environment `production`). No confirmar que el fix está en producción hasta correr un smoke test real contra la URL productiva.
- **Fase 10 (Observabilidad/backups) — PENDIENTE:** sin evidencia de logging estructurado, alertas o backups verificados en esta revisión.

## Fases 11–14 — Release

RC sin bugs P0/P1 → beta controlada en Cartagena → Google Play → iOS/TestFlight/App Store. Ninguna de las cuatro ha comenzado formalmente.

## Regla de priorización

Hasta completar RC1:

1. P0: bloquea build, seguridad, datos o circuito E2E.
2. P1: bloquea operación comercial confiable.
3. P2: mejora producto pero puede salir después de 1.0.

No se incorporarán nuevas funcionalidades P2 mientras existan P0 abiertos de release.
