# Fase 12 — Beta cerrada Cartagena

**Estado:** ACTIVA / NO LANZADA  
**Mercado:** Cartagena de Indias  
**Dependencia:** Fase 11 debe promover `1.0.0-rc.1` antes de activar la cohorte.

## Objetivo

Convertir la primera operación real de Nvet Care en un programa controlado, reversible y medible, sin abrir reservas indiscriminadamente mientras todavía existen gates operativos de Release Candidate pendientes.

La fase puede estar desarrollada y fusionada sin que la beta esté públicamente activa. La activación comercial ocurre solo cuando el manifiesto `docs/production/BETA_CARTAGENA_READINESS.json` queda completamente verificado y una auditoría estricta termina verde.

## Frontera runtime de la beta

El backend incorpora dos controles separados:

1. `NVET_CLOSED_BETA_ENABLED=true` convierte **nuevas reservas** en invite-only. El cliente debe pertenecer a la cohorte y el veterinario debe tener `VetProfile.city` compatible con Cartagena de Indias.
2. `NVET_BOOKING_ENABLED=false` detiene todas las **nuevas reservas** como control operacional de emergencia, pero no corta login, sesiones, recuperación de cuenta, historial ni la gestión de citas ya creadas.

La cohorte se configura mediante `NVET_CLOSED_BETA_CLIENT_HASHES`, una lista de SHA-256 de `User.id`. No se versionan correos, teléfonos, UUIDs crudos ni otros identificadores de usuarios.

Si el gate de beta se habilita sin una cohorte válida, booking falla cerrado con `CLOSED_BETA_COHORT_NOT_CONFIGURED`. Si un usuario no pertenece a la cohorte, responde `CLOSED_BETA_ACCESS_REQUIRED`. Si intenta reservar fuera del mercado, responde `CLOSED_BETA_MARKET_RESTRICTED`.

## Evidencia operacional redacted

La fase dispone de dos superficies autenticadas para verificar configuración sin exponer la cohorte:

- `GET /api/beta/policy` permite a CLIENT, VET y ADMIN conocer modo, mercado, estado de booking y si existe una cohorte válida.
- `GET /api/beta/readiness` es ADMIN-only y devuelve conteos agregados: tamaño de cohorte, límite de lanzamiento y número de veterinarios verificados/activos cuyo `city` contiene Cartagena.

El endpoint administrativo **nunca devuelve hashes, UUIDs, correos, teléfonos ni identificadores de veterinarios o clientes**. Su función es generar evidencia redacted para `cartagenaVetCoverageVerified` y `clientCohortConfigured`.

`localActivationReady=true` significa únicamente que la cohorte local está configurada dentro del máximo de 50 clientes y existe cobertura mínima de tres veterinarios. No reemplaza los gates externos de RC, privacidad, soporte, pago ni rollback.

## Cohorte inicial

La política v1 fija un máximo inicial de **50 clientes** y un mínimo operativo de **3 veterinarios verificados y activos** en Cartagena. Estos números son límites de lanzamiento, no metas comerciales permanentes.

La ampliación de cohorte debe ocurrir por lotes y solo después de revisar:

- tasa de reserva completada;
- cancelaciones y disputas;
- errores de pago;
- disponibilidad real de veterinarios;
- incidentes P0/P1;
- latencia/readiness del backend;
- tickets de soporte y problemas de onboarding.

## Herencia de Release Candidate

Los gates `productionBackupConfigured`, `restoreDrillVerified`, `productionAlertingVerified` y `paymentRailVerified` pertenecen al RC y no pueden ser promovidos de manera independiente por Fase 12. El gate `scripts/verify-cartagena-beta-evidence-inheritance.mjs` exige que el manifiesto de beta conserve el mismo estado y, cuando corresponda, la misma referencia de evidencia que `RC_READINESS.json`.

A 3 de septiembre de 2026, `productionAlertingVerified` ya tiene evidencia heredable de Fase 11. Backup del proveedor, restore drill del proveedor y transferencia bancaria real permanecen bloqueados y no deben simularse con tests locales.

## Gates de lanzamiento

La beta no puede activarse mientras falte cualquiera de los siguientes controles:

- `1.0.0-rc.1` formalmente promovido por Fase 11;
- backup automático productivo verificado;
- restore drill fechado;
- alertamiento de producción verificado;
- al menos un rail de pago beta validado end-to-end;
- cobertura mínima de veterinarios Cartagena;
- cohorte de clientes cargada en configuración del proveedor;
- responsable operativo y ruta de escalamiento confirmados;
- términos/privacidad de beta revisados;
- prueba del procedimiento para detener nuevas reservas.

El estado machine-readable vive en `docs/production/BETA_CARTAGENA_READINESS.json`.

## Criterios de detención

Durante la beta, nuevas reservas deben detenerse si ocurre cualquiera de estas condiciones hasta completar triage:

- pérdida o corrupción de datos;
- escalación de privilegios o bypass de autorización;
- cobro duplicado o inconsistencia financiera sistémica;
- imposibilidad sostenida de completar el circuito cita → servicio → cierre;
- readiness degradado sin capacidad de recuperación operacional;
- incidente P0 activo.

El mecanismo preferido es `NVET_BOOKING_ENABLED=false`, porque conserva el acceso de usuarios y la capacidad del equipo para atender citas ya existentes.

## Criterio de salida de Fase 12

Fase 12 puede declararse **LANZADA** únicamente cuando la auditoría `Cartagena Closed Beta Readiness` ejecutada con enforcement estricto termina verde y la configuración del proveedor tiene:

- `NVET_CLOSED_BETA_ENABLED=true`;
- `NVET_BOOKING_ENABLED=true`;
- una cohorte válida no vacía;
- mercado Cartagena configurado.

La fase se considera **COMPLETA** después de una ventana mínima de observación de 7 días sin P0 abierto y con evidencia de al menos un circuito real reserva → pago → atención → cierre → review realizado dentro de la cohorte.
