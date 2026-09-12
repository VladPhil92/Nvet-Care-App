# Phase 31 — Android Play Internal Release

Phase 31 convierte la preparación Android ya existente en un contrato canónico de **Internal Testing** para `com.nvetcare`, sin confundir ingeniería terminada con evidencia externa todavía pendiente.

## Objetivo

Dejar el repositorio completamente preparado para construir, verificar y entregar un AAB firmado al track `internal` de Google Play cuando las dependencias externas estén disponibles. Esta fase no crea por sí sola la aplicación en Play Console, no provisiona secretos, no simula firma, no instala en dispositivos físicos y no autoriza lanzamiento público.

## Regla de avance

La preparación de ingeniería puede desplegarse antes de cerrar la evidencia externa de Phase 28–30. El verificador debe permanecer verde cuando el contrato técnico sea correcto aunque existan gates externos pendientes; esos pendientes se reflejan en el reporte como `ENGINEERING_READY_EXTERNAL_BLOCKED` y nunca se auto-verifican.

El workflow de Phase 31 consulta el último run exitoso de `cartagena-beta-observation-phase30.yml` sobre `main`, descarga su artifact canónico cuando existe y pasa ese JSON al verificador mediante `--phase30-report`. Si no existe un reporte real descargable, Phase 31 permanece fail-closed y no avanza por inferencia.

Para ejecutar realmente build + upload de Internal Testing se requiere, como mínimo:

- promoción controlada del candidato exacto `1.0.0-rc.2`;
- aplicación `com.nvetcare` creada en la cuenta Play correcta;
- Play App Signing configurado;
- upload certificate aprobado y fingerprint provisionado;
- política de privacidad publicada y revisión Data Safety;
- acceso de reviewer preparado;
- secretos de firma y service account disponibles en el environment protegido `production`.

## Automatización desplegada

Phase 31 añade:

- `docs/production/PHASE_31_ANDROID_PLAY_INTERNAL_RELEASE.json` como contrato canónico;
- `scripts/verify-android-play-internal-release-phase31.mjs` como verificador fail-closed;
- `.github/workflows/android-play-internal-release-phase31.yml` como gate de CI;
- integración con `GLOBAL_READINESS.json` para que la ingeniería de Phase 31 pueda medirse separadamente de Play/operator evidence.

El contrato reutiliza la infraestructura ya desplegada:

- `ANDROID_PRODUCTION_READINESS.json`;
- `ANDROID_RELEASE_PREFLIGHT.json`;
- `ANDROID_PLAY_COMPLIANCE.json`;
- `ANDROID_PLAY_INTERNAL_RUNBOOK.md`;
- `.github/workflows/release-android.yml`.

## Ventana mínima de observación interna

Cuando `internalTrackUploaded` se marque como `verified`, debe registrar el campo `observedAt` con el timestamp ISO-8601 real de la carga completada al track interno. El verificador calcula el tiempo transcurrido y exige **24 horas reales** antes de permitir el estado `INTERNAL_RELEASE_VALIDATED`.

La existencia anticipada de smoke evidence no reduce ni elimina esta ventana. Un timestamp futuro, inválido o ausente en evidencia marcada como verificada provoca fallo del contrato.

## Estados

### `ENGINEERING_READY_EXTERNAL_BLOCKED`

El repositorio y sus contratos técnicos están listos, pero uno o más gates de proveedor/operador siguen pendientes. Este es el estado esperado mientras se aplazan pagos reales, promoción del RC, Play Console, firma o validación física.

### `READY_FOR_OPERATOR_BUILD_AND_UPLOAD`

Los gates previos al build/upload están verificados, pero todavía no existe evidencia del AAB firmado y/o de su carga al track interno.

### `INTERNAL_DRAFT_OBSERVING`

El AAB y la carga al track interno están verificados, pero todavía no han transcurrido las 24 horas mínimas desde `internalTrackUploaded.observedAt`.

### `INTERNAL_DRAFT_UPLOADED_AWAITING_DEVICE_SMOKE`

La ventana de observación ya se cumplió, pero faltan las pruebas físicas obligatorias.

### `INTERNAL_RELEASE_VALIDATED`

Todos los gates de Phase 31 están verificados, han transcurrido las 24 horas mínimas y existe smoke test físico válido. Este estado sigue sin autorizar rollout al track `production`.

## Límites de seguridad y gobernanza

Phase 31 mantiene de forma obligatoria:

- track automatizado máximo: `internal`;
- status automatizado máximo: `draft`;
- promoción automática a producción: prohibida;
- secretos o keystores en Git: prohibidos;
- evidencia externa fabricada o sintética: prohibida;
- lanzamiento comercial/público automático: prohibido.

La transferencia bancaria real, la activación/observación de beta, la configuración de Play Console, la custodia de credenciales, el tiempo real transcurrido y los dispositivos físicos permanecen fuera del alcance automático del repositorio.
