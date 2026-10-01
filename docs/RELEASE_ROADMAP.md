# Nvet Care — Production Roadmap v1.0

**Baseline de producto vigente (rc.3):** `733aa8854a2b39af33ebd6df25d2e0f6aa4d1b71` (`main` tras PR #310)  
**Gobernanza rc.3 integrada en:** `140463e7034b1c5f558cc5249ce103a574cc6c02`  
**Revisión:** 2026-10-01 (anterior: 2026-09-12)  
**Programa activo:** Phase 32 — Production Release Candidate Certification & Google Play Internal (`docs/production/PHASE_32_RELEASE_CANDIDATE_CERTIFICATION.json`)  
**Candidato objetivo:** `1.0.0-rc.3`. `1.0.0-rc.2` queda como candidato histórico, nunca promovido; ver "Alineación de gobernanza rc.2 → rc.3".  
**Modo operativo actual:** `EXTERNAL_EVIDENCE_BLOCKED`. La ingeniería estática está certificada; la certificación E2E Android y la evidencia externa siguen pendientes.

La fuente canónica del estado global es `docs/production/GLOBAL_READINESS.json`. La ruta 1.0 separa estrictamente **engineering completion**, **machine runtime evidence** y **external/operator evidence**. Un pendiente externo puede bloquear promoción, beta o publicación, pero nunca debe representarse como funcionalidad de software inexistente.

## Arquitectura canónica

La plataforma web pública vive en `ctgone.com/nvetcareapp`, implementada en `VladPhil92/ctg_one_website`. Este repositorio contiene `backend/` como fuente de verdad del dominio, `mobile/` como aplicación React Native y `dashboard/` como implementación histórica/deprecada independiente. Web y móvil consumen el mismo backend y comparten contratos de identidad, autorización, reservas, pagos, notificaciones y ciclo de vida de cuenta.

## Estado ejecutivo por fase

| Fase | Objetivo | Estado 2026-10-01 |
|---|---|---|
| 0 | Consolidación del repositorio | COMPLETA |
| 1 | Baseline técnico + CI reproducible | COMPLETA |
| 2 | Base móvil nativa | ANDROID COMPLETO PARA RC / iOS POST-RC |
| 3 | Staging aislado | IMPLEMENTADO + PREFLIGHT/E2E AUTOMATIZADO |
| 4 | Circuito E2E MVP | IMPLEMENTADO; certificación Android 01→02→03 sobre RN 0.87 **PENDIENTE** (ver Etapa 1) |
| 5 | Geolocalización Cartagena | IMPLEMENTADA; evidencia física permanece externa |
| 6 | Chat + tiempo real + notificaciones | IMPLEMENTACIÓN COMPLETA PARA BASELINE RC; evidencia física/proveedor separada |
| 7 | Pagos | CONTRATO + CERTIFICACIÓN AUTOMÁTICA IMPLEMENTADOS; transferencia bancaria real pendiente |
| 8 | Dashboard operativo | REUBICADO a `ctgone.com/nvetcareapp` |
| 9 | Seguridad/privacidad | CONTRATOS Y GATES IMPLEMENTADOS |
| 10 | Observabilidad/backups | ALERTING VERIFIED. Backup y restore **vencidos** (ventana de 168 h) y bloqueados por la falta de bucket de object storage en Railway (ver Etapa 3) |
| 11 | Release Candidate | SUPERADA POR PHASE 27/28/32; candidato objetivo `1.0.0-rc.3` |
| 12 | Beta cerrada Cartagena | INFRAESTRUCTURA COMPLETA; evidencia humana/operativa pendiente |
| 13 | Android Production | PREFLIGHT TÉCNICO COMPLETO; provider/signing/internal track/device evidence pendiente |
| 14 | iOS Production | POST-RC / NO BLOQUEA ANDROID 1.0 |
| 15–23 | Cobertura, supply VET, recruitment, invitations y SLA | IMPLEMENTADAS |
| 24 | Cartagena Launch Readiness | IMPLEMENTADA |
| 25 | Cartagena Launch Operations | IMPLEMENTADA |
| 26 | Service Quality Telemetry | IMPLEMENTADA |
| 27 | Release Candidate Freeze & Production Closure | COMPLETA para `1.0.0-rc.2`; el manifiesto de freeze aún no refleja rc.3 |
| 28 | External Evidence Closure & Controlled RC Promotion | INGENIERÍA COMPLETA; contrato todavía anclado a rc.2 @ `ac38256`. Bloqueado por 131 archivos de drift protegido, evidencia externa y el blocker #309 |
| 29 | Cartagena Beta Activation | INGENIERÍA COMPLETA; activación real bloqueada por evidencia externa |
| 30 | Cartagena Beta Observation Closure | INGENIERÍA COMPLETA; requiere beta activa + 168 horas reales |
| 31 | Android Play Internal Release | INGENIERÍA COMPLETA; handoff Phase 30 + ventana Internal de 24 h fail-closed |
| 32 | Software Supply Chain & Artifact Provenance | COMPLETA; SBOM, hashes, lockfile integrity y attestations |
| 32 (RC) | Production RC Certification & Google Play Internal (`1.0.0-rc.3`) | ESTÁTICA VERIFIED; `EXTERNAL_EVIDENCE_BLOCKED` (bucket, backup, restore, evidencia de proveedor, transferencia real, tag, AAB, Play Internal) |
| 36 | Production Observability & Real Beta Validation | INGENIERÍA INTEGRADA; requiere beta real |
| 38 | Artifact Reproducibility & Vulnerability Closure | VERIFIED |
| 39 | Dependency Vulnerability Remediation | INTEGRADA |
| 46 | Cross-Platform Convergence | INTEGRADA |
| 47 | Real Test Deployment Handoff | `ENGINEERING_BLOCKED` por el blocker #309 abierto. El workflow del piloto físico sigue fijado al SHA rc.2 `ac38256`, anterior a RN 0.87 |
| 48 | React Native 0.87 Security Migration | INTEGRADA (#293, #296–#302, #303, #307, #309, #310) |

## Ruta al despliegue comercial (vigente 2026-10-01)

Estado de los gates de Phase 47 en `main` @ `8f69c39`:
- Promoción RC: 1/4 (25 %).
- Play Internal: 3/13 (23 %).
- Beta operativa: 1/10 (10 %).
- `commercialLaunchAuthorized=false`.

Cada etapa abre la siguiente; las etapas 1–3 pueden avanzar en paralelo.

### Etapa 1 — Certificación E2E Android sobre el baseline rc.3 (ingeniería)

El run 36457295587 sobre `8f69c39` (producto = `733aa88`) es el más avanzado hasta ahora:
- la app arranca y mantiene el foco;
- el login, la búsqueda y el perfil del veterinario funcionan;
- el chat conecta y se reconecta.

Fallan tres pasos, los tres con causa en el test o en la estabilidad del circuito:

| Flujo | Falla | Causa / acción |
|---|---|---|
| 01 reserva | No encuentra `Mañana` | `BookingDateSelector` aplica `textTransform: 'uppercase'`; en Android el texto expuesto es `MAÑANA`. Ajustar el selector del test. |
| 02 veterinario | Root sin foco tras abrir el diálogo "Confirmar cita" | El `waitForElement(by.text('Confirmar cita'))` posterior al tap se evalúa sobre la ventana base, mientras el foco lo tiene el `AlertDialog`. Esperar el texto del diálogo o el botón `CONFIRMAR`. |
| 03 chat | El mensaje enviado no aparece en 15 s; la pantalla queda en "Inicia la conversación" | Investigar el envío por WebSocket en staging. Si la causa es de producto, requiere blocker y mueve el baseline rc.3. |

Criterio de cierre:
- circuito 01→02→03 verde en `main`;
- blocker #309 resuelto;
- Phase 47 `engineering.status=verified`.

### Etapa 2 — Alineación de gobernanza rc.2 → rc.3 (ingeniería, requiere aprobación del owner)

Phase 32 (RC) declara `1.0.0-rc.3`, pero los contratos que gobiernan la evidencia y la promoción siguen en rc.2:

- `OPERATOR_EVIDENCE_CONTROL.json`, `GLOBAL_READINESS.json` y `RELEASE_CANDIDATE_FREEZE.json` dicen `candidate: 1.0.0-rc.2`.
- `PHASE_28_CONTROLLED_RC_PROMOTION.json` promueve `1.0.0-rc.2` @ `ac38256`, anterior a RN 0.87, con 131 archivos de drift protegido.
- `PHASE_47_REAL_TEST_DEPLOYMENT_HANDOFF.json` y `real-device-pilot-phase47.yml` construyen el APK piloto desde `ac38256`.

Consecuencias mientras no se alineen:
- La evidencia `real-transfer-rail` no es reutilizable entre candidatos. Enviada contra rc.2, no servirá para rc.3; enviada contra rc.3, el control plane la rechaza (`candidate` debe coincidir).
- El piloto físico instalaría la app anterior a la migración de seguridad.

Esta alineación debe integrarse **antes** de registrar la transferencia real. Ancla de destino: el SHA certificado en la Etapa 1.

### Etapa 3 — Recuperación de datos (operador + proveedor)

1. Crear el bucket de object storage en Railway con credenciales válidas y enlazar `BUCKET` a `nvet-backup-postgres` y `nvet-restore-verify`.
2. Generar un backup cifrado fresco, con checksum y metadatos del artefacto retenidos.
3. Ejecutar el restore drill aislado hasta obtener `[VERIFY] ===== RESTORE DRILL PASSED =====`.
4. Retener la evidencia de backup/snapshot a nivel proveedor (Railway).
5. Registrar `production-backup-configured` y `provider-restore-drill`. El restore drill exige un aprobador distinto (`CerveceriaCTG`).

Las evidencias vencen a las 168 h. Backup, restore y transferencia deben quedar vigentes a la vez al promover.

### Etapa 4 — Transferencia bancaria real (owner financiero)

Se reprograma: la del 2026-09-28 no tiene registro en el ledger. Requiere la Etapa 2 integrada.

- Gate: `real-transfer-rail`.
- `evidence_kind`: `bank-reference` o `redacted-document`.
- Referencia redactada, sin números de cuenta completos.
- Aprobación por una cuenta distinta del remitente.

### Etapa 5 — Promoción del RC, AAB firmado y Google Play Internal

1. Configurar Play Console **antes** de cualquier subida automatizada. Es la configuración única que exige `docs/production/ANDROID_PLAY_INTERNAL_RUNBOOK.md`, porque la API de Android Publisher no puede crear un paquete que no existe:
   - app;
   - Play App Signing;
   - certificado de subida;
   - política de privacidad publicada;
   - Data Safety;
   - acceso del revisor;
   - acceso de la cuenta de servicio.

   Si la API rechaza la primera subida porque el paquete no tiene una versión inicial en la Console, subir un AAB firmado manualmente una vez, según el runbook.
2. Crear el tag inmutable `1.0.0-rc.3` sobre el SHA certificado y registrar el gate `rc-promoted`.
3. Ejecutar `release-android.yml` con:
   - `version_name=1.0.0-rc.3`;
   - `release_ref=1.0.0-rc.3`;
   - la URL `/api` de producción;
   - `publish_internal=true`.
4. Verificar el borrador en el track Internal y observarlo 24 h.

### Etapa 6 — Pruebas en dispositivos físicos

Instalar desde Play Internal (o con el APK piloto de Phase 47 ya re-anclado) en al menos 2 dispositivos físicos. Probar:
- autenticación y borrado de cuenta;
- permisos, navegación y conectividad con la API;
- subidas;
- chat y citas;
- transferencia;
- recuperación ante fallos.

### Etapa 7 — Beta cerrada Cartagena (Phase 29/30)

1. Verificar al menos 3 veterinarios.
2. Configurar una cohorte de hasta 50 clientes.
3. Confirmar el responsable de soporte.
4. Completar la revisión legal de privacidad y términos.
5. Ejecutar el rollback drill.
6. Observar 168 h reales.

### Etapa 8 — GO comercial

- Promoción manual a Google Play Production, solo con todos los gates anteriores vigentes.
- El lanzamiento comercial nunca se autoriza automáticamente.
- iOS sigue siendo post-1.0.

## Phase 27–31

Phase 27 congeló `1.0.0-rc.2` y protege los paths de producto. Phase 28 implementó promoción controlada del RC; `paymentRailVerified` continúa como evidencia bancaria real pendiente. Phase 29 implementó la activación de beta sin sintetizar participantes u operadores. Phase 30 exige 168 horas reales de observación. Phase 31 prepara Google Play Internal Testing con build firmado, compliance, upload limitado a `internal/draft`, consumo explícito del reporte runtime de Phase 30 y una ventana mínima de 24 horas medida desde el timestamp real de upload.

La Fase 31 está integrada en `main`. Ninguna de estas fases autoriza rollout automático a producción o lanzamiento comercial.

## Phase 32 — Software Supply Chain & Artifact Provenance

Phase 32 fortalece el origen e integridad del release sin cambiar backend, mobile o dashboard. Sus fuentes canónicas son:

- `docs/production/PHASE_32_SOFTWARE_SUPPLY_CHAIN.json`;
- `docs/production/PHASE_32_SOFTWARE_SUPPLY_CHAIN.md`;
- `scripts/generate-lockfile-spdx-sbom.mjs`;
- `scripts/verify-software-supply-chain-phase32.mjs`;
- `.github/workflows/software-supply-chain-phase32.yml`;
- `.github/workflows/release-android.yml`.

La fase implementa:

- validación fail-closed de `package-lock.json` v3;
- rechazo de transportes de resolución inseguros, incluidas variantes `git+http`/`git+ftp`;
- exigencia de integridad criptográfica para dependencias remotas HTTPS;
- SBOM SPDX 2.3 generado determinísticamente por código versionado directamente desde `package-lock.json`, sin instalar dependencias;
- manifiesto SHA-256 de entradas críticas del release, incluido el propio generador SPDX;
- Artifact Attestations de GitHub mediante OIDC/Sigstore;
- provenance del AAB firmado;
- SBOM attestation vinculada al AAB;
- pinning por SHA de `actions/checkout`, `actions/setup-node`, `actions/setup-java`, `actions/upload-artifact` y `actions/attest` en el pipeline de release.

Los PR generan y validan SBOM/hashes pero no firman attestations de ramas no integradas. En `main` o en un trusted manual run, las attestations se emiten mediante GitHub OIDC. Esto prueba procedencia técnica; no sustituye evidencia bancaria, beta, Play Console, certificados, dispositivos ni aprobación operacional.

## Engineering completion

`GLOBAL_READINESS.json -> engineeringGates` es la fuente de verdad de esta dimensión. Incluye CI, backend, Android nativo/E2E, seguridad, recovery, finanzas, Railway, convergencia web, Play compliance, account deletion, Android 16, Phase 27 freeze, Phase 28 controlled promotion, Phase 29 beta activation, Phase 30 observation closure, Phase 31 Android Play internal release y Phase 32 supply-chain provenance.

Un gate `verified` debe apuntar a evidencia versionada existente. Los verificadores fallan cerrado ante drift o pérdida de evidencia.

## Cola externa aplazada

El detalle y el orden vigentes están en "Ruta al despliegue comercial", Etapas 3–8. En resumen:

1. bucket de object storage, backup fresco, restore drill y evidencia de proveedor;
2. transferencia bancaria real y cierre de `paymentRailVerified`;
3. promoción controlada real del RC (`1.0.0-rc.3`);
4. Play Console, Play App Signing, secretos y certificado de subida;
5. publicación de la política de privacidad y Data Safety;
6. AAB real en Internal Testing y 24 horas de observación;
7. smoke test en al menos dos dispositivos físicos;
8. VET y CLIENT reales, soporte, revisión legal y de privacidad, y rollback drill;
9. activación deliberada de la beta y 168 horas reales.

## Próximas fases automatizables

Después de Phase 32, sin romper el feature freeze, pueden desarrollarse: reproducibilidad y verificación cruzada de artifacts, dependency/vulnerability closure, runbooks de incident response y preparación técnica iOS no bloqueante. Features grandes, migraciones arquitectónicas o cambios destructivos de datos siguen prohibidos mientras el producto permanezca congelado en el baseline rc.3.
