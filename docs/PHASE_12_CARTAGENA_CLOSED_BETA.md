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
