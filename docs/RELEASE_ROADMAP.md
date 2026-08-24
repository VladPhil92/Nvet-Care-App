# Nvet Care — Production Roadmap v1.0

**Baseline:** `main` @ `30252c9c29ffd6cd89011ea4a56226e6be5d231e`  
**Revisión:** 2026-08-24

Este roadmap sustituye el roadmap histórico del README. Su objetivo es llevar el producto actual a un release real y verificable.

## Estado por fase

| Fase | Objetivo | Estado |
|---|---|---|
| 0 | Consolidación del repositorio | EN CURSO |
| 1 | Baseline técnico + CI verde | PENDIENTE |
| 2 | Build móvil nativo Android/iOS | PENDIENTE |
| 3 | Infraestructura staging | PENDIENTE |
| 4 | Integración E2E del MVP | PENDIENTE |
| 5 | Geolocalización/Cartagena | PENDIENTE |
| 6 | Chat + notificaciones | PENDIENTE |
| 7 | Pagos productivos | PENDIENTE |
| 8 | Dashboard operativo | PENDIENTE |
| 9 | Seguridad/privacidad | PENDIENTE |
| 10 | Observabilidad/backups | PENDIENTE |
| 11 | Release Candidate | PENDIENTE |
| 12 | Beta cerrada Cartagena | PENDIENTE |
| 13 | Android Production | PENDIENTE |
| 14 | iOS Production | PENDIENTE |

## Fase 0 — Consolidación

Criterios de salida:

- arquitectura canónica documentada;
- prototipos/implementaciones duplicadas retirados del runtime del repositorio;
- README alineado con el estado real;
- documentación histórica claramente separada de documentación vigente;
- ausencia de secretos versionados conocida;
- paquetes oficiales inequívocos: `mobile`, `backend`, `dashboard`.

## Fase 1 — Baseline técnico

Debe producir en GitHub Actions:

```text
Backend      PASS
Mobile       PASS
Dashboard    PASS
CI Success   PASS
```

Incluye instalación reproducible, lint, typecheck, build, tests y branch protection.

## Fase 2 — Mobile native

Verificar/restaurar `mobile/android` y `mobile/ios`. Android es la prioridad de release. El criterio de salida Android es generar e instalar un AAB/APK release reproducible.

## Fase 3 — Staging

Provisionar PostgreSQL, backend HTTPS, secrets, mail transaccional y dashboard de staging. Ejecutar migraciones y smoke tests.

## Fase 4 — MVP E2E

Circuito obligatorio:

```text
registro → email → mascota → veterinario → cita → servicio → review
```

Ninguna feature secundaria debe bloquear este circuito.

## Fase 5 — Geolocalización

Cartagena como primera plaza operativa. Implementar permisos, coordenadas reales, vets cercanos, cobertura, mapa y tratamiento de fallos GPS.

## Fase 6 — Tiempo real

Chat autorizado por cita y notificaciones push para eventos críticos.

## Fase 7 — Pagos

Prioridad: métodos tradicionales. CTG Token no debe bloquear el MVP. Validar sandbox, webhooks, idempotencia, conciliación y estados de pago.

## Fases 8–10 — Operación

Dashboard, seguridad productiva, logs, alertas, backups y recuperación.

## Fases 11–14 — Release

RC sin bugs P0/P1 → beta controlada en Cartagena → Google Play → iOS/TestFlight/App Store.

## Regla de priorización

Hasta completar RC1:

1. P0: bloquea build, seguridad, datos o circuito E2E.
2. P1: bloquea operación comercial confiable.
3. P2: mejora producto pero puede salir después de 1.0.

No se incorporarán nuevas funcionalidades P2 mientras existan P0 abiertos de release.
