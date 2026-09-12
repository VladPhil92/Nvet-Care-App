# Nvet Care — Production Roadmap v1.0

**Baseline auditado:** `main` @ `eb38976b8e423415dafa5bc93fec3f0db598e484`  
**Revisión:** 2026-09-12  
**Programa activo de ingeniería:** Phase 31 — Android Play Internal Release  
**Candidato congelado:** `1.0.0-rc.2`  
**Modo operativo actual:** engineering-forward / external-evidence deferred

La fuente canónica para medir el estado global es `docs/production/GLOBAL_READINESS.json`, validada por `scripts/verify-global-readiness.mjs` y por el workflow `Nvet Global Release Readiness`.

La ruta 1.0 separa estrictamente tres dimensiones:

1. **engineering completion:** software, contratos, CI, seguridad, recovery y release tooling implementados en el repositorio;
2. **machine runtime evidence:** workflows y verificaciones ejecutadas con éxito sobre un SHA auditado;
3. **external/operator evidence:** hechos que requieren proveedor, cuenta administrativa, dispositivo físico, banco, participantes reales, tiempo real transcurrido, revisión jurídica o decisión operacional.

Un pendiente externo puede bloquear promoción, beta o publicación, pero nunca debe representarse como funcionalidad de software inexistente.

## Arquitectura canónica

La plataforma web pública de Nvet Care vive en `ctgone.com/nvetcareapp`, implementada en `VladPhil92/ctg_one_website`. Este repositorio contiene:

- `backend/`: fuente de verdad del dominio Nvet Care;
- `mobile/`: aplicación React Native con Android nativo y preparación iOS;
- `dashboard/`: implementación histórica/deprecada como producto web independiente, conservada para compatibilidad y referencia.

Web y móvil consumen el mismo backend y deben respetar los mismos contratos de identidad, autorización, reservas, pagos, notificaciones y ciclo de vida de cuenta.

## Estado ejecutivo por fase

| Fase | Objetivo | Estado 2026-09-12 |
|---|---|---|
| 0 | Consolidación del repositorio | COMPLETA |
| 1 | Baseline técnico + CI reproducible | COMPLETA |
| 2 | Base móvil nativa | ANDROID COMPLETO PARA RC / iOS POST-RC |
| 3 | Staging aislado | IMPLEMENTADO + PREFLIGHT/E2E AUTOMATIZADO |
| 4 | Circuito E2E MVP | IMPLEMENTADO Y CERTIFICADO POR CI/STAGING |
| 5 | Geolocalización Cartagena | IMPLEMENTADA; evidencia física permanece externa |
| 6 | Chat + tiempo real + notificaciones | IMPLEMENTACIÓN COMPLETA PARA BASELINE RC; evidencia física/proveedor separada |
| 7 | Pagos | CONTRATO + CERTIFICACIÓN AUTOMÁTICA IMPLEMENTADOS; transferencia bancaria real pendiente |
| 8 | Dashboard operativo | REUBICADO a `ctgone.com/nvetcareapp` |
| 9 | Seguridad/privacidad | CONTRATOS Y GATES IMPLEMENTADOS |
| 10 | Observabilidad/backups | BACKUP, RESTORE Y ALERTING VERIFIED EN READINESS CANÓNICO |
| 11 | Release Candidate | SUPERADA POR PHASE 27/28; candidato vigente `1.0.0-rc.2` |
| 12 | Beta cerrada Cartagena | INFRAESTRUCTURA COMPLETA; evidencia humana/operativa pendiente |
| 13 | Android Production | PREFLIGHT TÉCNICO COMPLETO; provider/signing/internal track/device evidence pendiente |
| 14 | iOS Production | POST-RC / NO BLOQUEA ANDROID 1.0 |
| 15–23 | Cobertura, supply VET, recruitment, invitations y SLA | IMPLEMENTADAS |
| 24 | Cartagena Launch Readiness | IMPLEMENTADA |
| 25 | Cartagena Launch Operations | IMPLEMENTADA |
| 26 | Service Quality Telemetry | IMPLEMENTADA |
| 27 | Release Candidate Freeze & Production Closure | COMPLETA; `1.0.0-rc.2` FROZEN |
| 28 | External Evidence Closure & Controlled RC Promotion | INGENIERÍA COMPLETA; promoción real bloqueada por evidencia bancaria |
| 29 | Cartagena Beta Activation | INGENIERÍA COMPLETA; activación real bloqueada por evidencia externa |
| 30 | Cartagena Beta Observation Closure | INGENIERÍA COMPLETA; requiere beta activa + 168 horas reales |
| 31 | Android Play Internal Release | INGENIERÍA EN DESPLIEGUE; external/operator evidence deliberadamente aplazada |

## Estado de Phase 27–30

Phase 27 congeló el producto en `1.0.0-rc.2` y mantiene un feature freeze fail-closed. Las rutas de producto protegidas solo pueden cambiar mediante un `release-blocker` auditable.

Phase 28 implementó la infraestructura de promoción controlada del RC. El único blocker RC pre-promoción vigente continúa siendo `paymentRailVerified`: una transferencia bancaria real controlada y evidencia privada/redactada del movimiento efectivo.

Phase 29 conecta la promoción real del RC con los diez gates de `BETA_CARTAGENA_READINESS.json`, Phase 24 y Phase 25. Su infraestructura está completa, pero no crea VET, CLIENT, soporte, revisión jurídica, rollback drill ni autorización operacional sintéticos.

Phase 30 formaliza el cierre técnico de una beta ya activada. Requiere 168 horas reales de observación y clasifica el resultado como `PASSED_TECHNICAL_BETA`, `REVIEW_REQUIRED`, `FAILED_TECHNICAL_BETA`, `OBSERVING` o `BLOCKED`. El tiempo real, los participantes y la telemetría de producción no pueden ser fabricados por CI.

## Phase 31 — Android Play Internal Release

Phase 31 avanza ahora porque su **ingeniería puede cerrarse sin ejecutar los hechos externos**. La fuente canónica es:

- `docs/production/PHASE_31_ANDROID_PLAY_INTERNAL_RELEASE.json`;
- `docs/production/PHASE_31_ANDROID_PLAY_INTERNAL_RELEASE.md`;
- `scripts/verify-android-play-internal-release-phase31.mjs`;
- `.github/workflows/android-play-internal-release-phase31.yml`.

La fase reutiliza `ANDROID_PRODUCTION_READINESS.json`, `ANDROID_RELEASE_PREFLIGHT.json`, `ANDROID_PLAY_COMPLIANCE.json`, `ANDROID_PLAY_INTERNAL_RUNBOOK.md` y `.github/workflows/release-android.yml`.

La automatización valida:

- identidad `com.nvetcare` y target API 36;
- firma fail-closed;
- pinning del upload certificate;
- build desde tag inmutable;
- verificación criptográfica del AAB;
- checksums y metadata de release;
- compliance Play, account deletion y Android 16;
- upload automatizado limitado al track `internal` y status `draft`;
- prohibición de promoción automática a producción.

Mientras la evidencia externa esté pendiente, el estado correcto de Phase 31 es `ENGINEERING_READY_EXTERNAL_BLOCKED`. Esto significa que la ingeniería está lista y que el bloqueo restante pertenece a operador/proveedor, no al código.

## Engineering completion

`GLOBAL_READINESS.json -> engineeringGates` es la fuente de verdad de esta dimensión. El baseline incluye CI, backend, Android nativo/E2E, seguridad, recovery, finanzas, Railway, convergencia web, Play compliance, account deletion, Android 16, Phase 27 freeze, Phase 28 controlled promotion, Phase 29 beta activation, Phase 30 observation closure y Phase 31 Android Play internal release.

Un gate `verified` debe apuntar a evidencia versionada existente. El verificador falla cerrado si la evidencia desaparece o un source gate deriva.

## Machine runtime evidence

`Nvet Global Release Readiness` consolida el estado del SHA auditado consultando los workflows canónicos:

- `ci.yml`;
- `railway-contract.yml`;
- `staging-e2e.yml`;
- `recovery-readiness.yml`;
- `payment-rail-certification.yml`;
- `production-deployment-attestation.yml`;
- `web-production-convergence.yml`.

Los reportes de cierre, promoción, activación, observación y Play Internal Release consumen estos contratos pero no sustituyen evidencia externa.

## Cola externa aplazada

Los siguientes pasos se mantienen explícitamente pendientes y **no deben bloquear el trabajo de ingeniería automatizable actual**:

1. transferencia bancaria real y cierre de `paymentRailVerified`;
2. promoción controlada del RC exacto `1.0.0-rc.2`;
3. incorporación/verificación de VET reales de Cartagena y cohorte CLIENT real;
4. soporte operativo, revisión legal/privacy y rollback drill;
5. activación deliberada de la beta;
6. 168 horas reales de observación;
7. creación/configuración final de `com.nvetcare` en Play Console;
8. Play App Signing, upload certificate y secretos protegidos;
9. publicación final de privacy policy y Data Safety review;
10. AAB firmado, upload real a Internal Testing y smoke test en al menos dos dispositivos físicos.

## Trabajo automatizable todavía disponible

Sin romper el feature freeze ni tocar producción, el repositorio puede seguir avanzando en:

- endurecimiento de Phase 31 y evidencia de provenance de artifacts;
- auditorías de dependencias, supply-chain y reproducibilidad;
- cobertura de tests unitarios/integración/E2E que no requieran proveedores reales;
- validadores de configuración y contratos de deployment;
- documentación y runbooks de incident response/release;
- preparación técnica iOS no bloqueante, siempre que no introduzca cambios funcionales en el candidato Android congelado.

No se deben abrir features grandes, migraciones arquitectónicas ni cambios destructivos de base de datos mientras el candidato `1.0.0-rc.2` permanezca congelado.
