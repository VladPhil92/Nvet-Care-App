# Nvet Care — Production Roadmap v1.0

**Baseline auditado:** `main` @ `43c864d7f502651fc363842f71275f1797c88254`  
**Revisión:** 2026-09-10  
**Programa activo:** Phase 29 — Cartagena Beta Activation  
**Candidato congelado:** `1.0.0-rc.2`

Este documento describe la ruta operativa vigente hacia Nvet Care 1.0. La fuente canónica para medir el estado global es `docs/production/GLOBAL_READINESS.json`, validada por `scripts/verify-global-readiness.mjs` y por el workflow `Nvet Global Release Readiness`.

La regla principal del cierre 1.0 es separar tres dimensiones:

1. **engineering completion:** software, contratos, CI, seguridad, recovery y release tooling implementados en el repositorio;
2. **machine runtime evidence:** workflows y verificaciones ejecutadas con éxito sobre el SHA auditado;
3. **external/operator evidence:** hechos que requieren proveedor, cuenta administrativa, dispositivo físico, banco, participantes reales, revisión jurídica o decisión operacional.

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
| 28 | External Evidence Closure & Controlled RC Promotion | INFRAESTRUCTURA COMPLETA; PROMOCIÓN BLOQUEADA POR EVIDENCIA BANCARIA REAL |
| 29 | Cartagena Beta Activation | EN DESPLIEGUE; ACTIVACIÓN FAIL-CLOSED SOBRE EVIDENCIA BETA REAL |
| 30 | Cartagena Beta Observation Closure | SIGUIENTE DESPUÉS DE ACTIVACIÓN; REQUIERE 7 DÍAS DE OBSERVACIÓN |

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

Phase 28 no agrega funcionalidades de producto. Su infraestructura está implementada y establece una promoción auditable del RC sin conceder autoridad automática de lanzamiento.

Fuentes:

- `docs/production/PHASE_28_CONTROLLED_RC_PROMOTION.json`;
- `docs/production/PHASE_28_CONTROLLED_RC_PROMOTION.md`;
- `scripts/verify-controlled-rc-promotion.mjs`;
- `.github/workflows/controlled-rc-promotion.yml`.

La promoción real se ejecuta únicamente mediante `workflow_dispatch`, después de que todos los gates RC estén `verified`, no existan blockers abiertos y el producto no haya derivado desde el candidato congelado.

El tag `1.0.0-rc.2` debe apuntar al commit candidato exacto. La creación del tag produce evidencia; no auto-aprueba `rcPromoted`. La proyección hacia Android y Beta sigue perteneciendo al Operator Evidence Control append-only.

El blocker vigente antes de esa promoción continúa siendo `paymentRailVerified`: transferencia bancaria real controlada con evidencia privada/redactada del movimiento efectivo.

## Phase 29 — Cartagena Beta Activation

Phase 29 agrega una capa canónica de orquestación sobre la infraestructura de Beta Cartagena ya existente. No reemplaza Phase 24 ni Phase 25: las conecta con la promoción real del RC y con los diez gates de evidencia de `BETA_CARTAGENA_READINESS.json`.

Fuentes:

- `docs/production/PHASE_29_CARTAGENA_BETA_ACTIVATION.json`;
- `docs/production/PHASE_29_CARTAGENA_BETA_ACTIVATION.md`;
- `scripts/verify-cartagena-beta-activation-phase29.mjs`;
- `.github/workflows/cartagena-beta-activation-phase29.yml`.

Phase 29 exige:

- promoción exacta del RC y `rcPromoted=verified`;
- cero release blockers y cero deriva del producto congelado;
- los diez beta evidence gates verificados;
- al menos tres veterinarios reales de Cartagena operational-ready;
- una cohorte real de CLIENT verificados;
- soporte real, monitoreado y time-bounded;
- revisión legal/privacy responsable;
- rollback drill real mediante el booking kill switch;
- Phase 24 `GO` antes de habilitación;
- autorización de operador explícita y bounded.

Un reporte `READY_FOR_OPERATOR_ACTIVATION` significa que la evidencia versionada está cerrada. No significa que Railway haya sido modificado, que la beta esté activa ni que exista autorización comercial.

La habilitación efectiva de `NVET_CLOSED_BETA_ENABLED=true` permanece como decisión operacional deliberada. Phase 29 nunca crea participantes sintéticos ni auto-aprueba evidencia para alcanzar readiness.

## Engineering completion

`GLOBAL_READINESS.json -> engineeringGates` es la fuente de verdad de esta dimensión. El baseline incluye CI, backend, Android nativo/E2E, seguridad, recovery, finanzas, Railway, convergencia web, Play compliance, account deletion, Android 16, Phase 27 freeze, Phase 28 controlled-promotion contract y Phase 29 Cartagena beta activation contract.

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

Los reportes de cierre, promoción y activación consumen estos contratos pero no sustituyen la evidencia externa.

## RC external/operator evidence

En el estado vigente:

- `productionBackupConfigured`: `verified`;
- `restoreDrillVerified`: `verified`;
- `productionAlertingVerified`: `verified`;
- `main-branch-protection`: `verified` mediante repository ruleset activo;
- `paymentRailVerified`: `pending`.

Por tanto, el **único blocker externo pre-promoción del RC** es la transferencia bancaria real controlada.

## Beta external/operator evidence

La activación Cartagena hereda los gates RC y añade hechos operativos que no pueden fabricarse desde CI. Mientras Phase 28 no haya promovido el candidato y no se hayan cerrado los hechos reales de Beta, Phase 29 debe permanecer `BLOCKED`.

Los gates beta humanos principales son:

- `cartagenaVetCoverageVerified`;
- `clientCohortConfigured`;
- `supportOwnerConfirmed`;
- `privacyAndTermsReviewed`;
- `rollbackDrillVerified`.

`rcPromoted` y `paymentRailVerified` también permanecen blocking mientras Phase 28 no cierre la cadena RC.

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

## Cartagena Beta observation

Una activación válida no concluye la beta. Antes de iniciar la observación Phase 25 exige soporte y autorización con al menos **169 horas** restantes. El máximo permitido es **192 horas**.

La siguiente fase de cierre será Phase 30: utilizará el ledger append-only de Phase 25 y la telemetría de Phase 26 para cerrar siete días completos de observación. El cierre de esa ventana seguirá sin equivaler a autorización de expansión comercial.

## Android Production

Baseline técnico:

- `applicationId`: `com.nvetcare`;
- target API 36;
- Android 16 behavior contract verificado;
- account deletion lifecycle verificado;
- Play compliance contract verificado;
- unsigned reproducible RC AAB disponible desde Phase 27 certification.

La ruta Android sigue bloqueada por hechos externos como Play Console, Play App Signing, upload certificate, política pública, Data Safety, reviewer access, AAB firmado, internal track y pruebas físicas en al menos dos dispositivos.

## Regla de promoción y activación

No se promueve un RC ni se activa la beta porque el software "parezca listo". La secuencia es:

1. engineering baseline verificado;
2. contratos/runtime obligatorios sanos;
3. todos los gates RC pre-promoción `verified`;
4. cero release blockers y cero deriva del candidato congelado;
5. promoción controlada del SHA exacto y aprobación de `rc-promoted`;
6. todos los beta evidence gates `verified`;
7. Phase 24 `GO`;
8. soporte + autorización bounded;
9. decisión explícita de provider enablement;
10. Phase 25 observation durante siete días.

## Prioridad vigente

1. **P0 externo RC:** completar `paymentRailVerified` con transferencia real y evidencia redactada.
2. **P0 release:** ejecutar Phase 28 controlled promotion y aprobar `rc-promoted` por Operator Evidence Control.
3. **P0 beta:** cerrar evidencia real de VET supply, cohort, soporte, legal/privacy y rollback para Cartagena.
4. **P0 activation:** obtener Phase 24 `GO`, emitir autorización bounded y habilitar deliberadamente la beta.
5. **P1 observation:** completar la ventana de siete días y Phase 30.
6. **P1 Android:** Play/signing/internal track/device smoke.
7. **P2:** iOS y nuevas features para 1.1/2.0.

Hasta la promoción y estabilización de la beta no deben abrirse features grandes o migraciones arquitectónicas que incrementen innecesariamente la superficie de riesgo.
