# Fase 11 — Release Candidate

**Estado:** ACTIVA / NO PROMOVIDA  
**Objetivo de esta iteración:** convertir `1.0.0-rc.1` en una promoción basada en evidencia, no en una etiqueta manual.

## Principio

Un merge a `main`, un build exitoso o un despliegue del proveedor no convierten por sí solos a Nvet Care en Release Candidate. La promoción RC exige que el mismo candidato satisfaga de forma verificable los gates de código, runtime, staging, integración CTG One y operación externa.

## Gate automatizado

`.github/workflows/release-candidate-readiness.yml` implementa dos modos:

1. **PR / contract-only:** valida que el manifiesto RC y el evaluador sigan siendo estructuralmente válidos. No exige que los pendientes operativos ya estén resueltos, por lo que el contrato puede evolucionar mediante PR sin bloquear por evidencia externa todavía inexistente.
2. **Audit / runtime:** en ejecución programada o manual revisa el `main` actual y produce un resumen de readiness. Una ejecución manual con `enforce=true` falla si cualquier gate continúa bloqueado.

El estado externo declarativo vive en `docs/production/RC_READINESS.json`. Un gate solo puede pasar a `verified` cuando contiene una referencia concreta de evidencia; no se permite convertir un pendiente en PASS mediante texto ambiguo.

## Gates de promoción RC1

### Código y despliegue

- CI completo del candidato en `main` debe terminar `success` sobre el SHA exacto.
- `Railway Contract` debe terminar `success` sobre el mismo SHA.
- El canary público del backend debe haber terminado `success` dentro de la ventana configurada.

### Integración y staging

- `Staging E2E Seed & Preflight` debe tener una ejecución exitosa suficientemente reciente.
- El canary `Nvet Production Access Canary` de `ctg_one_website` debe demostrar conectividad CTG One web -> Nvet backend dentro de la ventana configurada.

### Operación externa

Antes de promoción comercial deben estar verificadas con evidencia concreta:

- backup automático de producción;
- restauración de prueba fechada;
- alertamiento operativo ante readiness sostenidamente degradado/down;
- al menos un rail de pago previsto para el MVP probado end-to-end.

Estos cuatro puntos permanecen deliberadamente `pending` al crear esta fase: el repositorio no debe fabricar evidencia del proveedor que no puede observar.

## Qué NO bloquea RC1 por sí solo

La distribución pública iOS pertenece a Fase 14 y la publicación en stores a Fases 13/14. Su ausencia no convierte automáticamente el backend/web/Android RC en inválido; sí bloquea la promoción correspondiente de esas plataformas.

## Criterio de promoción

Nvet Care puede etiquetarse como `1.0.0-rc.1` únicamente cuando una auditoría manual de **Release Candidate Readiness** ejecutada con `enforce=true` termine verde y no exista un P0/P1 abierto que invalide el circuito crítico.

Hasta ese momento la Fase 11 está **activa**, pero el producto **no está promovido a RC**.
