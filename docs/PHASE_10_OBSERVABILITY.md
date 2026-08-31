# Fase 10 — Observabilidad y evidencia operativa

**Estado:** PARCIAL / EN DESPLIEGUE  
**Baseline:** posterior a `e73987c16949`  
**Alcance de esta iteración:** observabilidad de aplicación y canary público del backend.

## Objetivo

Convertir las capacidades de observabilidad que ya existen en el backend en un contrato operativo verificable, seguro para exposición pública y útil para release engineering.

## Capacidades verificadas en código

- logging estructurado con `nestjs-pino`;
- propagación de `X-Request-Id` y correlación por usuario/rol;
- redacción automática de credenciales y PII sensible;
- captura opcional de errores y trazas con Sentry;
- endpoints separados de liveness y readiness;
- readiness con dependencia PostgreSQL y timeout explícito;
- graceful shutdown;
- health checks de proceso y memoria.

## Cambios de esta fase

1. El health público deja de devolver mensajes crudos de PostgreSQL/proveedor. Un fallo de dependencia se representa únicamente como `dependency_unavailable`.
2. Liveness y readiness incluyen `revision`, pero solo si el runtime aporta un SHA Git válido. El valor se acorta a 12 caracteres; cualquier otro contenido falla cerrado a `unknown`.
3. Los probes `/health`, `/health/live` y `/health/ready` se excluyen del auto-logging HTTP para evitar ruido operacional sin perder errores reales en los sistemas de observabilidad.
4. Una suite Jest certifica que la revisión es segura y que una excepción con credenciales o hostname privados no puede aparecer en el payload público.
5. GitHub Actions incorpora un canary programado contra el backend Railway canónico. El canary no forma parte del grafo de checks de `push`, para no crear una dependencia circular con el autodeploy.

## Límites deliberados

Esta fase **no certifica backups de PostgreSQL**. La retención, restauración y prueba de backups deben verificarse en el proveedor de base de datos/Railway con evidencia externa. Tampoco se considera que un SHA esté físicamente desplegado solo porque el commit esté en `main`; para eso se requiere evidencia del runtime o del canary posterior al rollout.

## Criterio de salida de Fase 10

Para declarar la fase completa deben existir, además de este contrato de observabilidad:

- backup automático de producción configurado;
- restauración de prueba documentada y fechada;
- alerta operativa para readiness sostenidamente degradado/down;
- evidencia de al menos un canary posterior al despliegue exitoso;
- runbook de incidente con responsables y procedimiento de rollback.

Hasta entonces, la clasificación correcta es **PARCIAL**, aunque el bloque de observabilidad de aplicación quede desplegado.
