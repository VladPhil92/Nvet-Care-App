# Nvet Care — Production Roadmap v1.0

**Baseline auditado:** `main` @ `bee7afd3382a63344e572f0856847db1d63eadac`  
**Revisión:** 2026-09-10  
**Programa activo:** Phase 28 — External Evidence Closure & Controlled RC Promotion  
**Candidato congelado:** `1.0.0-rc.2`

Este documento describe la ruta operativa vigente hacia Nvet Care 1.0. La fuente canónica para medir el estado global es `docs/production/GLOBAL_READINESS.json`, validada por `scripts/verify-global-readiness.mjs` y por el workflow `Nvet Global Release Readiness`.

La regla principal del cierre 1.0 es separar tres dimensiones:

1. **engineering completion:** software, contratos, CI, seguridad, recovery y release tooling implementados en el repositorio;
2. **machine runtime evidence:** workflows y verificaciones ejecutadas con éxito sobre el SHA auditado;
3. **external/operator evidence:** hechos que requieren proveedor, cuenta administrativa, dispositivo físico, banco, Play Console, firma o decisión operacional.

Un pendiente externo bloquea la promoción o activación correspondiente, pero no puede representarse como una funcionalidad de software inexistente.

## Arquitectura canónica

La plataforma web pública de Nvet Care vive en `ctgone.com/nvetcareapp`, implementada en `VladPhil92/ctg_one_website`. Este repositorio contiene:

- `backend/`: fuente de verdad del dominio Nvet Care;
- `mobile/`: aplicación React Native con Android nativo y preparación iOS;
- `dashboard/`: implementación histórica/deprecada como producto web independiente, conservada para compatibilidad y referencia.

Web y móvil consumen el mismo backend y deben respetar los mismos contratos de identidad, autorización, reservas, pagos, notificaciones y ciclo de vida de cuenta.

## Estado ejecutivo por fase

| Fase | Objetivo | Estado 2026-09-10 |
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
| 10 | Observabilidad/backups | BACKUP, RESTORE Y ALERTING REPRESENTADOS COMO VERIFIED EN READINESS CANÓNICO |
| 11 | Release Candidate | SUPERADA POR PHASE 27/28; candidato vigente `1.0.0-rc.2` |
| 12 | Beta cerrada Cartagena | INFRAESTRUCTURA COMPLETA; evidencia humana/operativa pendiente |
| 13 | Android Production | PREFLIGHT TÉCNICO AVANZADO; Play/signing/internal track/device smoke pendientes |
| 14 | iOS Production | POST-RC / NO BLOQUEA ANDROID 1.0 |
| 15–23 | Cobertura, supply VET, recruitment, invitations y SLA | IMPLEMENTADAS |
| 24 | Cartagena Launch Readiness | IMPLEMENTADA |
| 25 | Cartagena Launch Operations | IMPLEMENTADA |
| 26 | Service Quality Telemetry | IMPLEMENTADA |
| 27 | Release Candidate Freeze & Production Closure | COMPLETA; `1.0.0-rc.2` FROZEN |
| 28 | External Evidence Closure & Controlled RC Promotion | EN DESPLIEGUE |
| 29 | Cartagena Beta Activation | SIGUIENTE; BLOQUEADA HASTA PROMOCIÓN RC + EVIDENCIA BETA REAL |

## Estado de Phase 27

Phase 27 congeló el producto en `1.0.0-rc.2` y activó un feature freeze fail-closed. Las rutas de producto protegidas solo pueden cambiar mediante un `release-blocker` auditable. `RELEASE_BLOCKERS.json` debe permanecer vacío en estado estable.

El candidato congelado usa:

- `applicationId`: `com.nvetcare`;
- Android `versionName`: `1.0.0-rc.2`;
- Android `versionCode`: `10002`;
- mercado inicial: Cartagena de Indias, DANE `13001`;
- canal: closed beta;
- `commercialLaunchAuthorized=false`;
- `publicStoreReleaseAuthorized=false`.

## Phase 28 — Controlled RC Promotion

Phase 28 no agrega funcionalidades de producto. Su objetivo es cerrar la evidencia externa necesaria para promover el RC y crear una promoción auditable sin conceder autoridad automática de lanzamiento.

Fuentes nuevas:

- `docs/production/PHASE_28_CONTROLLED_RC_PROMOTION.json`;
- `docs/production/PHASE_28_CONTROLLED_RC_PROMOTION.md`;
- `scripts/verify-controlled-rc-promotion.mjs`;
- `.github/workflows/controlled-rc-promotion.yml`.

La promoción real se ejecuta únicamente mediante `workflow_dispatch`, después de que todos los gates RC estén `verified`, no existan blockers abiertos y el producto no haya derivado desde el candidato congelado.

El tag `1.0.0-rc.2` debe apuntar al commit candidato exacto. La creación del tag produce evidencia; no auto-aprueba `rcPromoted`. La proyección hacia Android y Beta sigue perteneciendo al Operator Evidence Control append-only.

## Engineering completion

`GLOBAL_READINESS.json -> engineeringGates` es la fuente de verdad de esta dimensión. El baseline incluye CI, backend, Android nativo/E2E, seguridad, recovery, finanzas, Railway, convergencia web, Play compliance, account deletion, Android 16, Phase 27 freeze y Phase 28 controlled-promotion contract.

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

Los reportes de cierre y promoción consumen estos contratos pero no sustituyen la evidencia externa.

## RC external/operator evidence

En el estado vigente:

- `productionBackupConfigured`: `verified`;
- `restoreDrillVerified`: `verified`;
- `productionAlertingVerified`: `verified`;
- `main-branch-protection`: `verified` mediante repository ruleset activo;
- `paymentRailVerified`: `pending`.

Por tanto, el **único blocker externo pre-promoción del RC** es la transferencia bancaria real controlada.

## Pagos — frontera manual vigente

Crear una cita o certificar el rail TRANSFER en staging no constituye movimiento real de fondos. `paymentRailVerified` solo puede cambiar a `verified` después de una transferencia bancaria real controlada, con evidencia privada/redactada y verificable del movimiento efectivo.

La evidencia se gobierna mediante `real-transfer-rail` en `OPERATOR_EVIDENCE_CONTROL.json`. Un estado interno de aplicación, dato sintético o workflow verde no satisface el gate.

## Repository governance

`main` está gobernado por el ruleset activo `Protect main` (`22639793`), que:

- exige pull request;
- exige `CI Success`;
- bloquea eliminación de la rama;
- bloquea non-fast-forward;
- no contiene bypass actors.

Classic branch protection no es la autoridad usada para este control; el ruleset del repositorio es la evidencia canónica.

## Beta Cartagena después de RC promotion

La promoción del RC no activa la beta. Phase 29 deberá cerrar los gates beta restantes, incluyendo:

- al menos 3 veterinarios reales de Cartagena operational-ready;
- cohort real de clientes;
- owner y canal de soporte confirmados;
- revisión legal/privacy de beta;
- rollback drill real del booking kill switch;
- ventana posterior de observación operativa.

Las capas técnicas para supply, recruitment, invitations, launch readiness, launch operations y service-quality telemetry ya están implementadas.

## Android Production

Baseline técnico:

- `applicationId`: `com.nvetcare`;
- target API 36;
- Android 16 behavior contract verificado;
- account deletion lifecycle verificado;
- Play compliance contract verificado;
- unsigned reproducible RC AAB disponible desde Phase 27 certification.

La ruta Android sigue bloqueada por hechos externos como Play Console, Play App Signing, upload certificate, política pública, Data Safety, reviewer access, AAB firmado, internal track y pruebas físicas en al menos dos dispositivos.

## Regla de promoción 1.0

No se promueve un RC porque el software "parezca listo". La promoción solo ocurre cuando:

1. el engineering baseline requerido está verificado;
2. los contratos/runtime obligatorios están sanos;
3. todos los gates RC pre-promoción están `verified`;
4. la evidencia contiene referencia concreta y propietario;
5. no existen release blockers abiertos;
6. no existe deriva en las rutas de producto congeladas;
7. la promoción se ejecuta por el workflow controlado y contra el SHA candidato exacto.

## Prioridad vigente

1. **P0 externo:** completar `paymentRailVerified` con transferencia real y evidencia redactada.
2. **P0 release:** ejecutar Phase 28 controlled promotion y aprobar `rc-promoted` por Operator Evidence Control.
3. **P0 beta:** cerrar evidencia real de VET supply, cohort, soporte, legal/privacy y rollback para Cartagena.
4. **P1 Android:** Play/signing/internal track/device smoke.
5. **P2:** iOS y nuevas features para 1.1/2.0.

Hasta la promoción y estabilización de la beta no deben abrirse features grandes o migraciones arquitectónicas que incrementen innecesariamente la superficie de riesgo.
