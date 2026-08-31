# Nvet Care — Production Roadmap v1.0

**Baseline verificado:** `main` @ `2f2d55e` (Fase 12 — Beta cerrada Cartagena)
**Revisión:** 2026-08-31

Este documento es el roadmap operativo vigente de Nvet Care. Sustituye estados históricos que ya no representan el repositorio actual y distingue deliberadamente entre **infraestructura mergeada**, **evidencia verificada** y **activación comercial**.

## Arquitectura canónica

La única plataforma web de Nvet Care es `ctgone.com/nvetcareapp`, implementada en `VladPhil92/ctg_one_website`. Este repositorio contiene:

- `backend/`: única fuente de verdad del dominio Nvet Care;
- `mobile/`: aplicación React Native Android/iOS;
- `dashboard/`: implementación histórica/deprecada como producto web independiente. Puede conservar lógica de referencia, pero no es una segunda plataforma de producción.

Web y móvil deben consumir el mismo backend y respetar los mismos contratos de identidad, autorización, reservas y pagos.

## Estado ejecutivo por fase

| Fase | Objetivo | Estado actual |
|---|---|---|
| 0 | Consolidación del repositorio | COMPLETA |
| 1 | Baseline técnico + CI reproducible | COMPLETA |
| 2 | Base móvil nativa | ANDROID AVANZADO / iOS PENDIENTE |
| 3 | Staging aislado | BLOQUEADO por credenciales/provider externos |
| 4 | Circuito E2E MVP | PARCIAL |
| 5 | Geolocalización Cartagena | AVANZADA |
| 6 | Chat + tiempo real + notificaciones | PARCIAL |
| 7 | Pagos productivos | PARCIAL; rails externos no certificados |
| 8 | Dashboard operativo | REUBICADA a `ctgone.com/nvetcareapp` |
| 9 | Seguridad/privacidad | AVANZADA |
| 10 | Observabilidad/backups | INFRAESTRUCTURA AVANZADA; evidencia provider pendiente |
| 11 | Release Candidate | GATE MERGEADO; promoción `1.0.0-rc.1` pendiente |
| 12 | Beta cerrada Cartagena | INFRAESTRUCTURA MERGEADA; beta no activada |
| 13 | Android Production | EN DESARROLLO — API 36 + release firmado/readiness |
| 14 | iOS Production | PENDIENTE |

## Identidad CTG One

La identidad compartida CTG One ↔ Nvet Care está implementada con verificación server-side del token de Supabase, `ctgUserId` único y sesión Nvet emitida por el backend. El provisioning de primera visita crea un usuario CLIENT cuando no existe vínculo previo. Un correo coincidente con una cuenta Nvet preexistente **no se auto-vincula**: el sistema falla cerrado para evitar account takeover y requiere un flujo de vinculación autenticada.

El login público no expone selección de rol. CLIENT, VET, ADMIN y SUPERADMIN comparten el mismo punto de entrada; el backend determina el rol efectivo y los guards siguen siendo autoritativos.

## Fases 0–2 — Base técnica

La raíz usa npm workspaces y `package-lock.json` canónico. CI cubre backend, React Native, Android Gradle y el dashboard histórico. La aplicación mantiene Node.js 22 como runtime de proyecto; las acciones de GitHub se migran a releases compatibles con runtime Node 24 para evitar depender de acciones basadas en Node 20 deprecado.

Android dispone de proyecto nativo, Detox, bundle técnico de release y workflow de AAB firmado. iOS sigue sin proyecto nativo completo y por ello no puede considerarse iniciado el release de App Store.

## Fase 3 — Staging

Existen contratos y workflows de staging, pero el entorno aislado real depende de credenciales/provider que no se pueden fabricar desde el repositorio. La salida exige backend y base de datos independientes, secrets propios y un E2E exitoso sin tocar producción.

## Fase 4 — MVP E2E

Circuito obligatorio:

`registro/identidad → mascota → veterinario → disponibilidad → cita → servicio → review`

Los tests y contratos existen parcialmente. La fase no termina hasta tener una corrida reproducible sobre un entorno aislado o equivalente controlado.

## Fase 5 — Cartagena y geolocalización

Cartagena de Indias es la primera plaza operativa. El dominio incluye ciudad/radio de servicio, disponibilidad, tracking y coordenadas de cita. La validación física de permisos, GPS y comportamiento en dispositivos sigue formando parte del release móvil.

## Fase 6 — Tiempo real

El dominio de chat y tracking está avanzado. Push notifications productivas (FCM/APNs), entrega en background y estrategia de reintentos permanecen como deuda de release; no deben simularse como verificadas.

## Fase 7 — Pagos

El booking y el dominio financiero están desacoplados correctamente: crear una cita no crea una transacción financiera fantasma. Para la experiencia web actual se mantiene TRANSFER como rail utilizable mientras CTG/PSE no estén certificados end-to-end. Ningún adapter sandbox o stub cuenta como rail productivo.

## Fases 8–10 — Operación y seguridad

El dashboard operativo vive en CTG One. Seguridad incluye contraseñas Argon2id, lockout, sesiones revocables, 2FA opcional, auditoría y guards por rol. SUPERADMIN hereda capacidades administrativas, pero no existe auto-promoción desde identidad CTG One.

Observabilidad cuenta con health/readiness contracts y canaries, pero backups, restore drill, alertas externas y rutas de escalamiento deben documentarse con evidencia provider/operator antes de un lanzamiento abierto.

## Fase 11 — Release Candidate

La infraestructura de RC está mergeada. `docs/production/RC_READINESS.json`, su verificador y el workflow `Release Candidate Readiness` separan CI técnico de evidencia externa.

**No equivale a haber promovido `1.0.0-rc.1`.** El tag/promoción solo debe ocurrir cuando todos los gates requeridos estén satisfechos y exista evidencia reproducible.

## Fase 12 — Beta cerrada Cartagena

Mergeada en `main` mediante PR #98. Añade:

- `NVET_BOOKING_ENABLED=false` como kill switch de nuevas reservas;
- `NVET_CLOSED_BETA_ENABLED=true` como gate de cohorte;
- cohorte configurada mediante SHA-256 de `User.id`, sin identificadores crudos versionados;
- restricción de nuevas reservas al mercado Cartagena durante la beta;
- contrato `BETA_CARTAGENA_READINESS.json` y auditoría de readiness.

La configuración por defecto **no activa la beta**. Activarla exige las evidencias de RC, backups/restore, alerting, rail de pago, cobertura veterinaria, cohorte, soporte, privacidad y rollback.

## Fase 13 — Android Production

Fase activa de desarrollo. El objetivo es producir un AAB firmado y trazable apto para Google Play sin publicar automáticamente antes de completar los gates externos.

Baseline tecnológico de la fase:

- `applicationId`: `com.nvetcare`;
- `compileSdk`: 36;
- `targetSdk`: 36;
- Android Gradle Plugin: 8.10.1;
- Gradle: 8.11.1;
- JDK: 17;
- Node de aplicación/CI: 22.x;
- GitHub Actions core: generaciones compatibles con runtime Node 24.

La cadena de release exige tag inmutable, upload keystore desde Secrets, fingerprint SHA-256 fijado, AAB firmado, verificación criptográfica, checksum y metadata del commit realmente compilado. La publicación a Play Console continúa separada hasta verificar App Signing, Data safety, política de privacidad, track interno y smoke tests físicos.

Fuente de verdad de esta fase: `docs/PHASE_13_ANDROID_PRODUCTION.md` y `docs/production/ANDROID_PRODUCTION_READINESS.json`.

## Fase 14 — iOS Production

No debe iniciarse como release formal hasta crear y estabilizar el proyecto iOS nativo, resolver firma Apple/entitlements, ejecutar E2E y establecer TestFlight como gate previo a App Store.

## Regla de priorización

Hasta cerrar RC y beta controlada:

1. **P0:** seguridad, pérdida/corrupción de datos, autenticación, build/release imposible o rollback inexistente.
2. **P1:** impide operar reservas/servicio/pagos de forma confiable o bloquea una evidencia obligatoria de lanzamiento.
3. **P2:** mejora de producto que puede esperar al release posterior.

No se promueve una fase por el mero hecho de que el código haya sido mergeado. Cada fase de release termina únicamente con sus gates técnicos y operativos satisfechos.
