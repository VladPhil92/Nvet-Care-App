# Nvet Care — Production Roadmap v1.0

**Baseline auditado:** `main` @ `7a9126b71efbd85f6db5d1b7e43173cd663aacb6`  
**Revisión:** 2026-09-10  
**Programa activo:** Phase 30 — Cartagena Beta Observation Closure  
**Candidato congelado:** `1.0.0-rc.2`

Este documento describe la ruta operativa vigente hacia Nvet Care 1.0. La fuente canónica para medir el estado global es `docs/production/GLOBAL_READINESS.json`, validada por `scripts/verify-global-readiness.mjs` y por el workflow `Nvet Global Release Readiness`.

La regla principal del cierre 1.0 es separar tres dimensiones:

1. **engineering completion:** software, contratos, CI, seguridad, recovery y release tooling implementados en el repositorio;
2. **machine runtime evidence:** workflows y verificaciones ejecutadas con éxito sobre el SHA auditado;
3. **external/operator evidence:** hechos que requieren proveedor, cuenta administrativa, dispositivo físico, banco, participantes reales, tiempo real transcurrido, revisión jurídica o decisión operacional.

Un pendiente externo bloquea la promoción, activación u observación correspondiente, pero no puede representarse como una funcionalidad de software inexistente.

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
| 10 | Observabilidad/backups | BACKUP, RESTORE Y ALERTING VERIFIED EN READINESS CANÓNICO |
| 11 | Release Candidate | SUPERADA POR PHASE 27/28; candidato vigente `1.0.0-rc.2` |
| 12 | Beta cerrada Cartagena | INFRAESTRUCTURA COMPLETA; evidencia humana/operativa pendiente |
| 13 | Android Production | PREFLIGHT TÉCNICO AVANZADO; Play/signing/internal track/device smoke pendientes |
| 14 | iOS Production | POST-RC / NO BLOQUEA ANDROID 1.0 |
| 15–23 | Cobertura, supply VET, recruitment, invitations y SLA | IMPLEMENTADAS |
| 24 | Cartagena Launch Readiness | IMPLEMENTADA |
| 25 | Cartagena Launch Operations | IMPLEMENTADA |
| 26 | Service Quality Telemetry | IMPLEMENTADA |
| 27 | Release Candidate Freeze & Production Closure | COMPLETA; `1.0.0-rc.2` FROZEN |
| 28 | External Evidence Closure & Controlled RC Promotion | INFRAESTRUCTURA COMPLETA; promoción real aún bloqueada por evidencia bancaria |
| 29 | Cartagena Beta Activation | INFRAESTRUCTURA COMPLETA; activación real bloqueada por evidencia externa |
| 30 | Cartagena Beta Observation Closure | EN DESPLIEGUE; requiere beta activa + 168 horas reales |
| 31 | Android Play Internal Release | SIGUIENTE DESPUÉS DEL CIERRE/REVISIÓN DE BETA |

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

La promoción real se ejecuta después de que todos los gates RC estén `verified`, no existan blockers abiertos y el producto no haya derivado desde el candidato congelado. El blocker vigente pre-promoción continúa siendo `paymentRailVerified`: transferencia bancaria real controlada con evidencia privada/redactada del movimiento efectivo.

## Phase 29 — Cartagena Beta Activation

Phase 29 conecta la promoción real del RC con los diez gates de `BETA_CARTAGENA_READINESS.json`, Phase 24 y Phase 25.

Fuentes:

- `docs/production/PHASE_29_CARTAGENA_BETA_ACTIVATION.json`;
- `docs/production/PHASE_29_CARTAGENA_BETA_ACTIVATION.md`;
- `scripts/verify-cartagena-beta-activation-phase29.mjs`;
- `.github/workflows/cartagena-beta-activation-phase29.yml`.

Phase 29 exige promoción exacta del RC, los diez beta evidence gates, al menos tres veterinarios reales operational-ready, cohorte CLIENT real, soporte, revisión legal/privacy, rollback drill, Phase 24 `GO` y autorización bounded. La habilitación efectiva de `NVET_CLOSED_BETA_ENABLED=true` permanece como acción operacional deliberada.

## Phase 30 — Cartagena Beta Observation Closure

Phase 30 formaliza el cierre técnico de una beta ya activada. Reutiliza:

- el ledger append-only de Phase 25;
- `GET /api/beta/launch-readiness`;
- `GET /api/beta/launch-operations`;
- `GET /api/operations/service-quality?windowHours=168&marketDaneCode=13001` de Phase 26.

Fuentes:

- `docs/production/PHASE_30_CARTAGENA_BETA_OBSERVATION_CLOSURE.json`;
- `docs/production/PHASE_30_CARTAGENA_BETA_OBSERVATION_CLOSURE.md`;
- `scripts/verify-cartagena-beta-observation-phase30.mjs`;
- `.github/workflows/cartagena-beta-observation-phase30.yml`.

Phase 30 no declara éxito por el simple paso del tiempo. Produce cinco estados:

- `BLOCKED`: prerequisitos reales incompletos;
- `OBSERVING`: beta activa pero ventana aún no cerrada;
- `PASSED_TECHNICAL_BETA`: 168 horas cerradas y seis métricas SLO requeridas en `PASS` con muestra suficiente;
- `REVIEW_REQUIRED`: ventana cerrada pero existe `WATCH` o `INSUFFICIENT_DATA`;
- `FAILED_TECHNICAL_BETA`: observación abortada o métrica requerida en `BREACHED`.

El snapshot runtime usado para el cierre debe ser agregado y redactado. El verificador rechaza PII, identificadores de usuarios/VET/mascotas, direcciones y coordenadas. El tiempo de observación no puede ser acelerado, simulado o rellenado retroactivamente por CI.

Ningún resultado de Phase 30 autoriza automáticamente lanzamiento comercial, expansión nacional o publicación en stores.

## Engineering completion

`GLOBAL_READINESS.json -> engineeringGates` es la fuente de verdad de esta dimensión. El baseline incluye CI, backend, Android nativo/E2E, seguridad, recovery, finanzas, Railway, convergencia web, Play compliance, account deletion, Android 16, Phase 27 freeze, Phase 28 controlled promotion, Phase 29 beta activation y Phase 30 observation closure.

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

Los reportes de cierre, promoción, activación y observación consumen estos contratos pero no sustituyen evidencia externa.

## RC external/operator evidence

En el estado vigente:

- `productionBackupConfigured`: `verified`;
- `restoreDrillVerified`: `verified`;
- `productionAlertingVerified`: `verified`;
- `main-branch-protection`: `verified`;
- `paymentRailVerified`: `pending`.

Por tanto, el **primer blocker externo pre-promoción del RC** continúa siendo la transferencia bancaria real controlada.

## Beta external/operator evidence

Los gates humanos principales antes de activar Cartagena son:

- `cartagenaVetCoverageVerified`;
- `clientCohortConfigured`;
- `supportOwnerConfirmed`;
- `privacyAndTermsReviewed`;
- `rollbackDrillVerified`.

`rcPromoted` y `paymentRailVerified` también permanecen blocking mientras Phase 28 no cierre la cadena RC.

## Frontera manual obligatoria

La automatización del repositorio puede preparar y verificar contratos, pero no puede crear hechos reales para satisfacer release evidence. El orden de intervención humana es:

1. ejecutar una transferencia bancaria real controlada y conservar evidencia redactada;
2. cerrar `paymentRailVerified` y promover el RC exacto;
3. incorporar/verificar al menos tres VET reales de Cartagena;
4. configurar una cohorte CLIENT real;
5. confirmar soporte operativo y revisión legal/privacy;
6. ejecutar un rollback drill real;
7. habilitar deliberadamente la beta después de Phase 24 `GO`;
8. iniciar y dejar transcurrir 168 horas reales de observación.

Desde el punto 8, la recolección y clasificación técnica puede volver a automatizarse sobre evidencia agregada.

## Android Production

Baseline técnico:

- `applicationId`: `com.nvetcare`;
- target API 36;
- Android 16 behavior contract verificado;
- account deletion lifecycle verificado;
- Play compliance contract verificado;
- unsigned reproducible RC AAB disponible desde Phase 27 certification.

La ruta Android sigue bloqueada por Play Console, Play App Signing, upload certificate, política pública, Data Safety, reviewer access, AAB firmado, internal track y pruebas físicas en al menos dos dispositivos.

## Prioridad vigente

1. **P0 externo RC:** completar `paymentRailVerified` con transferencia real y evidencia redactada.
2. **P0 release:** ejecutar Phase 28 controlled promotion y aprobar `rc-promoted`.
3. **P0 beta:** cerrar VET supply, cohort, soporte, legal/privacy y rollback.
4. **P0 activation:** Phase 24 `GO`, autorización bounded y habilitación deliberada.
5. **P1 observation:** completar 168 horas reales y ejecutar Phase 30 sobre telemetría agregada.
6. **P1 Android:** Phase 31 Play internal release, signing y device smoke.
7. **P2:** iOS y nuevas features para 1.1/2.0.

Hasta la estabilización de la beta no deben abrirse features grandes o migraciones arquitectónicas que incrementen innecesariamente la superficie de riesgo.
