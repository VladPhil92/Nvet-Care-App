# Nvet Care — Production Roadmap v1.0

**Baseline auditado:** `main` @ `33e7c52f46ee73ff38bb0f6f07a819d1abddd97e`  
**Revisión:** 2026-09-07  
**Programa activo:** Global Release Closure

Este documento describe la ruta operativa hacia Nvet Care 1.0. La fuente canónica para medir el estado global es `docs/production/GLOBAL_READINESS.json`, validada por `scripts/verify-global-readiness.mjs` y por el workflow `Nvet Global Release Readiness`.

La regla principal del cierre 1.0 es separar tres dimensiones que antes aparecían mezcladas:

1. **engineering completion:** software, contratos, CI, seguridad, recovery y release tooling implementados en el repositorio;
2. **machine runtime evidence:** workflows y verificaciones ejecutadas con éxito sobre el SHA auditado;
3. **external/operator evidence:** hechos que requieren proveedor, cuenta administrativa, dispositivo físico, banco, Play Console, firma o decisión operacional.

Un pendiente externo bloquea la promoción del release, pero no puede representarse como una funcionalidad de software inexistente.

## Arquitectura canónica

La plataforma web pública de Nvet Care vive en `ctgone.com/nvetcareapp`, implementada en `VladPhil92/ctg_one_website`. Este repositorio contiene:

- `backend/`: fuente de verdad del dominio Nvet Care;
- `mobile/`: aplicación React Native con Android nativo y preparación iOS;
- `dashboard/`: implementación histórica/deprecada como producto web independiente, conservada para compatibilidad y referencia.

Web y móvil deben consumir el mismo backend y respetar los mismos contratos de identidad, autorización, reservas, pagos, notificaciones y ciclo de vida de cuenta.

## Estado ejecutivo por fase

| Fase | Objetivo | Estado 2026-09-07 |
|---|---|---|
| 0 | Consolidación del repositorio | COMPLETA |
| 1 | Baseline técnico + CI reproducible | COMPLETA |
| 2 | Base móvil nativa | ANDROID COMPLETO PARA RC / iOS POST-RC |
| 3 | Staging aislado | IMPLEMENTADO Y CON PREFLIGHT/E2E AUTOMATIZADO |
| 4 | Circuito E2E MVP | IMPLEMENTADO; CI/STAGING CERTIFICAN LOS FLUJOS CRÍTICOS |
| 5 | Geolocalización Cartagena | IMPLEMENTADA; validación física sigue como evidencia externa |
| 6 | Chat + tiempo real + notificaciones | IMPLEMENTACIÓN AVANZADA; evidencia física/proveedor sigue separada |
| 7 | Pagos | CONTRATO Y CERTIFICACIÓN AUTOMÁTICA IMPLEMENTADOS; transferencia bancaria real pendiente |
| 8 | Dashboard operativo | REUBICADO a `ctgone.com/nvetcareapp` |
| 9 | Seguridad/privacidad | CONTRATOS Y GATES IMPLEMENTADOS |
| 10 | Observabilidad/backups | AUTOMATIZACIÓN IMPLEMENTADA; backup provider/restore real pendientes de evidencia |
| 11 | Release Candidate | INFRAESTRUCTURA COMPLETA; promoción `1.0.0-rc.1` pendiente de evidencia externa |
| 12 | Beta cerrada Cartagena | INFRAESTRUCTURA COMPLETA; activación comercial pendiente |
| 13 | Android Production | CÓDIGO/CONTRATO AVANZADO; Play, firma, AAB y dispositivos físicos pendientes |
| 14 | iOS Production | POST-RC / NO BLOQUEA ANDROID 1.0 |
| Closure I | Readiness global canónico | EN DESPLIEGUE mediante `GLOBAL_READINESS.json` |

## Identidad y roles

La identidad compartida CTG One ↔ Nvet Care utiliza verificación server-side del token de Supabase, `ctgUserId` único y sesión Nvet emitida por el backend. El provisioning de primera visita crea un usuario CLIENT cuando no existe vínculo previo. Un correo coincidente con una cuenta Nvet preexistente no se auto-vincula: el sistema falla cerrado para evitar account takeover.

CLIENT, VET, ADMIN y SUPERADMIN comparten el punto de entrada; el backend determina el rol efectivo y los guards son autoritativos. La selección inicial de tipo de usuario y los dashboards diferenciados no sustituyen la autorización server-side.

## Engineering completion

El repositorio mantiene contratos verificables para:

- CI agregado y builds reproducibles;
- backend NestJS/PostgreSQL;
- Android nativo y Detox;
- seguridad y límites de autorización;
- recovery y restore tooling a nivel de aplicación;
- pagos y reconciliación/certificación del rail TRANSFER;
- Railway deployment/readiness;
- convergencia web;
- Google Play compliance;
- eliminación de cuenta;
- compatibilidad Android 16/API 36.

La fuente de verdad de esta dimensión es `engineeringGates` dentro de `GLOBAL_READINESS.json`. Un gate marcado `verified` debe apuntar a evidencia versionada existente y el verificador falla cerrado si esa evidencia desaparece o si un source gate deriva a `pending`.

## Machine runtime evidence

`Nvet Global Release Readiness` consolida el estado del SHA auditado consultando los workflows canónicos:

- `ci.yml`;
- `railway-contract.yml`;
- `staging-e2e.yml`;
- `recovery-readiness.yml`;
- `payment-rail-certification.yml`;
- `production-deployment-attestation.yml`;
- `web-production-convergence.yml`.

El resultado se publica en `.artifacts/global-readiness.json`. Un workflow que todavía está ejecutándose o que no tiene éxito para el SHA aparece como `BLOCKED`; el reporte no falsifica éxito por herencia de un SHA anterior.

## External/operator evidence pendiente

La promoción 1.0 permanece fail-closed mientras falte evidencia externa obligatoria. Los principales pendientes son:

- backup automático real del PostgreSQL productivo a nivel proveedor;
- restore drill real y controlado;
- transferencia bancaria real de valor mínimo y verificación independiente del movimiento;
- protección administrativa de `main` con PR + `CI Success` requerido;
- creación/configuración definitiva de Google Play Console;
- Play App Signing y certificado de upload;
- política de privacidad pública y revisión Data Safety;
- credenciales de reviewer;
- AAB firmado y trazable;
- carga a internal track;
- smoke test en al menos dos dispositivos Android físicos.

Estos gates se resuelven desde `RC_READINESS.json`, `ANDROID_PRODUCTION_READINESS.json` y `operatorGates` del manifiesto global. No deben copiarse manualmente a documentos secundarios.

## Recovery

El recovery a nivel de aplicación y sus gates automáticos ya forman parte del engineering baseline. No obstante, una prueba `pg_dump/pg_restore` o un workflow verde no sustituyen un restore real del proveedor. Para cerrar 1.0 se exige la cadena:

`backup provider existente → backup seleccionado → ventana controlada → restore → PostgreSQL validado → /api/health/ready válido → evidencia operator redacted`.

## Pagos

Crear una cita no crea una transacción financiera ficticia. El rail TRANSFER dispone de certificación automatizada, pero `paymentRailVerified` solo puede cambiar a `verified` después de una transferencia bancaria real controlada, con evidencia privada/redactada de fondos efectivamente movidos. Un estado interno de la aplicación no satisface este gate.

## Android Production

Baseline:

- `applicationId`: `com.nvetcare`;
- `compileSdk`: 36;
- `targetSdk`: 36;
- Android Gradle Plugin: 8.10.1;
- Gradle: 8.11.1;
- JDK: 17;
- Node: 22.x;
- release workflow fail-closed para signing y certificado.

La automatización puede construir y verificar el artefacto, pero no debe declarar como realizada la creación de la app en Play Console, la custodia de claves, la revisión Data Safety, la observación del internal track o las pruebas físicas hasta que exista evidencia real.

## Branch protection

El issue #77 sigue siendo un pendiente administrativo real. La configuración objetivo es:

- exigir pull request para `main`;
- requerir `CI Success`;
- bloquear pushes directos;
- mantener el gate aplicable a maintainers cuando el plan/configuración lo permita.

El repositorio puede verificar y documentar esta política, pero aplicarla requiere permisos de administración de GitHub.

## Regla de promoción 1.0

No se promueve `1.0.0-rc.1` ni Android Production porque el software "parezca listo". La promoción solo ocurre cuando:

1. `engineering = 100%`;
2. los runtime workflows obligatorios están verdes para el SHA candidato;
3. todos los external/operator gates bloqueantes están `verified`;
4. la evidencia tiene referencia concreta, fecha y propietario;
5. no existe documentación canónica contradictoria.

## Prioridad desde Closure I

1. **P0 técnico:** cualquier regresión en CI, seguridad, auth, recovery, pagos o build/release.
2. **P0 externo:** backup provider, restore drill, transferencia real, branch protection y cadena Play/signing.
3. **P1:** device smoke, internal track, reviewer access, política/Play declarations.
4. **P2:** nuevas features que puedan esperar a 1.1/2.0.

Hasta la promoción del RC no se abrirán migraciones arquitectónicas ni features grandes que aumenten innecesariamente la superficie de riesgo.
