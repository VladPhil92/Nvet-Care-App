# Nvet Care — Registro de artefactos legacy

**Revisión:** 2026-08-24

Este archivo documenta implementaciones históricas retiradas durante la consolidación del monorepo. El historial completo permanece disponible en Git.

## Artefactos retirados en Fase 0

### `Nvet Care App/nvet-care-v4.jsx`
Prototipo visual monolítico utilizado como referencia temprana. No forma parte del runtime actual.

### `dashboard/nvet-care-v4.jsx`
Copia del mismo prototipo dentro del paquete dashboard. El dashboard real utiliza `dashboard/src/main.tsx` y `dashboard/src/App.tsx`.

### `NvetCare/`
Migración React Native incompleta/intermedia. No contiene una aplicación ejecutable completa y fue sustituida por `mobile/`.

El token `NvetCare/src/theme/colors.ts` provenía del prototipo `nvet-care-v4.jsx`; el paquete oficial `mobile/src/theme/` contiene la evolución vigente del sistema visual.

## Política

- Los artefactos legacy no se mantendrán como código ejecutable paralelo.
- Si es necesario consultar una implementación histórica, debe recuperarse desde Git history o una tag, no reintroducirse en la raíz.
- Cualquier referencia visual útil debe migrarse explícitamente a `mobile/src/theme`, `dashboard/src/theme` o documentación de diseño.

## Documentación histórica

El repositorio conservaba varios informes de auditoría/progreso anteriores (`*_AUDIT.md`, `*_COMPLETE.md`, `MOBILE_*.md`, etc.) sueltos en la raíz. Se conservan como **snapshots históricos** — pueden contener evidencia técnica útil — pero ya no compiten con la documentación vigente en la raíz: viven en `docs/history/`.

La documentación normativa vigente para decisiones de arquitectura y release es:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/RELEASE_ROADMAP.md`
- runbooks específicos dentro de cada paquete, por ejemplo `backend/BOOTSTRAP_PROD.md`.
