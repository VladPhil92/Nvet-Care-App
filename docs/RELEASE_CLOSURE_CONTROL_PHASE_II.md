# Nvet Care — Release Closure Control Phase II

**Programa:** Global Release Closure  
**Objetivo:** convertir el cierre de Nvet Care 1.0 en un proceso por etapas, trazable y fail-closed, sin confundir software terminado con evidencia externa pendiente.

## Problema resuelto

Antes de esta fase existían manifiestos separados para RC, beta Cartagena, Android Production y readiness global. Esa separación es correcta, pero dejaba tres riesgos operativos:

1. una evidencia heredada de RC podía divergir manualmente en el manifiesto de beta;
2. un operador podía interpretar el readiness global como si todas las evidencias Android fueran prerrequisitos para promover el RC;
3. no existía un artefacto único que indicara cuál es la siguiente acción lógica según la etapa realmente bloqueada.

Phase II introduce un control de cierre por etapas y mantiene las fronteras externas: el software no declara como realizados hechos de banco, proveedor, Google Play, dispositivos físicos o administración de GitHub.

## Etapas

### RC

`rc` es el gate para promover `1.0.0-rc.1`.

Requiere:

- todos los gates externos de `RC_READINESS.json`;
- los gates de gobernanza de repositorio asignados a la etapa RC, actualmente `main-branch-protection`.

No requiere las evidencias posteriores de Google Play. Esto evita una dependencia circular: Android Production depende del RC promovido, por lo que el RC no puede depender a su vez de la cadena Play que requiere dicho RC.

### Android

`android` depende de `rc=READY` y después exige todas las evidencias de `ANDROID_PRODUCTION_READINESS.json`.

### Beta Cartagena

`beta` depende de `rc=READY` y después exige únicamente la evidencia propia de activación beta. Los gates de backup, restore, alerting y payment rail se heredan del RC y deben mantener exactamente su mismo estado; si están verificados, deben reutilizar la misma referencia de evidencia.

### Global

`global` conserva el criterio más estricto: todos los gates externos y de operador de `GLOBAL_READINESS.json` deben estar verificados.

## Artefactos

- `docs/production/RELEASE_CLOSURE_CONTROL.json`: contrato declarativo y dependencias.
- `scripts/verify-release-closure-control.mjs`: validador y generador del plan de cierre.
- `.github/workflows/release-closure-control.yml`: ejecución automática y manual.
- `.artifacts/release-closure-control.json`: evidencia generada en runtime/CI.

## Comandos

```bash
npm run release:closure:contract
npm run release:closure:report
npm run release:closure:rc
npm run release:closure:beta
npm run release:closure:android
```

Los comandos de enforce fallan cuando la etapa solicitada todavía tiene bloqueadores. El modo report genera evidencia sin falsear un error de ingeniería por la existencia esperada de pendientes externos.

## Invariantes

1. Una evidencia `verified` siempre debe tener una referencia concreta.
2. La evidencia RC heredada por beta no puede divergir de su fuente.
3. `rcPromoted` debe mantener estado y referencia coherentes entre Android y beta.
4. La promoción/activación permanece fail-closed.
5. Los gates manuales pendientes no reducen el porcentaje de engineering completion.
6. El control de release nunca transforma automáticamente una evidencia externa `pending` en `verified`.

## Secuencia de operación

```text
Engineering baseline
        ↓
Release Closure Control
        ↓
RC external/operator gates
        ↓
rc = READY
        ↓
Promote 1.0.0-rc.1
        ↓
┌──────────────────────────────┐
│                              │
Beta Cartagena             Android Production
│                              │
real cohort / vets          Play / signing / AAB
support / rollback          device smoke / track
│                              │
└──────────────┬───────────────┘
               ↓
        Global release closure
```

## Criterio de éxito de Phase II

La fase queda implementada cuando:

- el contrato de dependencias pasa CI;
- el workflow produce el artefacto de closure;
- cualquier drift entre RC y beta falla antes de merge;
- un `--enforce=rc` bloquea promoción mientras existan gates RC/operator pendientes;
- Android y beta quedan explícitamente subordinados al RC sin introducir circularidad.
