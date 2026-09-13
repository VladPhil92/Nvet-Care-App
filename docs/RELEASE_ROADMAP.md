# Nvet Care — Production Roadmap v1.0

**Baseline funcional congelado:** `0789ac8d405405b04372fc1ec92e749f7f6a29aa`  
**Último baseline integrado antes de Phase 32:** `main` @ `766a535b4991b6464b5d1b2d4fded247c54c8fa5`  
**Revisión:** 2026-09-12  
**Programa activo de ingeniería:** Phase 32 — Software Supply Chain & Artifact Provenance  
**Candidato congelado:** `1.0.0-rc.2`  
**Modo operativo actual:** engineering-forward / external-evidence deferred

La fuente canónica del estado global es `docs/production/GLOBAL_READINESS.json`. La ruta 1.0 separa estrictamente **engineering completion**, **machine runtime evidence** y **external/operator evidence**. Un pendiente externo puede bloquear promoción, beta o publicación, pero nunca debe representarse como funcionalidad de software inexistente.

## Arquitectura canónica

La plataforma web pública vive en `ctgone.com/nvetcareapp`, implementada en `VladPhil92/ctg_one_website`. Este repositorio contiene `backend/` como fuente de verdad del dominio, `mobile/` como aplicación React Native y `dashboard/` como implementación histórica/deprecada independiente. Web y móvil consumen el mismo backend y comparten contratos de identidad, autorización, reservas, pagos, notificaciones y ciclo de vida de cuenta.

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
| 31 | Android Play Internal Release | INGENIERÍA COMPLETA; handoff Phase 30 + ventana Internal de 24 h fail-closed |
| 32 | Software Supply Chain & Artifact Provenance | EN DESPLIEGUE; SBOM, hashes, lockfile integrity y attestations |

## Phase 27–31

Phase 27 congeló `1.0.0-rc.2` y protege los paths de producto. Phase 28 implementó promoción controlada del RC; `paymentRailVerified` continúa como evidencia bancaria real pendiente. Phase 29 implementó la activación de beta sin sintetizar participantes u operadores. Phase 30 exige 168 horas reales de observación. Phase 31 prepara Google Play Internal Testing con build firmado, compliance, upload limitado a `internal/draft`, consumo explícito del reporte runtime de Phase 30 y una ventana mínima de 24 horas medida desde el timestamp real de upload.

La Fase 31 está integrada en `main`. Ninguna de estas fases autoriza rollout automático a producción o lanzamiento comercial.

## Phase 32 — Software Supply Chain & Artifact Provenance

Phase 32 fortalece el origen e integridad del release sin cambiar backend, mobile o dashboard. Sus fuentes canónicas son:

- `docs/production/PHASE_32_SOFTWARE_SUPPLY_CHAIN.json`;
- `docs/production/PHASE_32_SOFTWARE_SUPPLY_CHAIN.md`;
- `scripts/verify-software-supply-chain-phase32.mjs`;
- `.github/workflows/software-supply-chain-phase32.yml`;
- `.github/workflows/release-android.yml`.

La fase implementa:

- validación fail-closed de `package-lock.json` v3;
- rechazo de URLs de resolución inseguras;
- exigencia de integridad criptográfica para dependencias remotas;
- SBOM SPDX generado con `npm sbom`;
- manifiesto SHA-256 de entradas críticas del release;
- Artifact Attestations de GitHub mediante OIDC/Sigstore;
- provenance del AAB firmado;
- SBOM attestation vinculada al AAB;
- pinning por SHA de `actions/checkout`, `actions/setup-node`, `actions/setup-java`, `actions/upload-artifact` y `actions/attest` en el pipeline de release.

Los PR generan y validan SBOM/hashes pero no firman attestations de ramas no integradas. En `main` o en un trusted manual run, las attestations se emiten mediante GitHub OIDC. Esto prueba procedencia técnica; no sustituye evidencia bancaria, beta, Play Console, certificados, dispositivos ni aprobación operacional.

## Engineering completion

`GLOBAL_READINESS.json -> engineeringGates` es la fuente de verdad de esta dimensión. Incluye CI, backend, Android nativo/E2E, seguridad, recovery, finanzas, Railway, convergencia web, Play compliance, account deletion, Android 16, Phase 27 freeze, Phase 28 controlled promotion, Phase 29 beta activation, Phase 30 observation closure, Phase 31 Android Play internal release y Phase 32 supply-chain provenance.

Un gate `verified` debe apuntar a evidencia versionada existente. Los verificadores fallan cerrado ante drift o pérdida de evidencia.

## Cola externa aplazada

Permanecen fuera del alcance automático actual:

1. transferencia bancaria real y cierre de `paymentRailVerified`;
2. promoción controlada real del RC;
3. incorporación/verificación de VET y CLIENT reales;
4. soporte operativo, revisión legal/privacy y rollback drill;
5. activación deliberada de beta;
6. 168 horas reales de beta;
7. Play Console / Play App Signing / secretos y certificado de upload;
8. publicación final de privacy policy y Data Safety;
9. AAB real subido a Internal Testing;
10. 24 horas reales en Internal Testing;
11. smoke test en al menos dos dispositivos físicos.

## Próximas fases automatizables

Después de Phase 32, sin romper el feature freeze, pueden desarrollarse: reproducibilidad y verificación cruzada de artifacts, dependency/vulnerability closure, runbooks de incident response y preparación técnica iOS no bloqueante. Features grandes, migraciones arquitectónicas o cambios destructivos de datos siguen prohibidos mientras `1.0.0-rc.2` permanezca congelado.
