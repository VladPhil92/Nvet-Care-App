# Nvet Care — Términos de participación Beta Cerrada Cartagena

**Versión:** `cartagena-beta-terms-v1-2026-09-03`  
**Vigencia técnica:** 3 de septiembre de 2026  
**Estado:** BORRADOR OPERATIVO — REVISIÓN JURÍDICA PENDIENTE

> Este documento define el contrato de producto que la aplicación presenta y versiona durante la beta. Su presencia en el repositorio no constituye aprobación jurídica. El gate `privacyAndTermsReviewed` debe permanecer `pending` hasta que la revisión responsable quede documentada.

## 1. Alcance de la beta

La Beta Cerrada Cartagena es un programa limitado de Nvet Care para validar en condiciones controladas el flujo de búsqueda, reserva, atención y cierre de servicios veterinarios en Cartagena de Indias. La participación es por invitación y puede suspenderse o limitarse por razones operativas, de seguridad o de calidad.

## 2. Elegibilidad

Para crear una reserva durante la beta, el usuario debe:

- tener una cuenta Nvet Care activa;
- pertenecer a la cohorte autorizada;
- aceptar expresamente la versión vigente de estos términos y del aviso de privacidad de beta;
- reservar únicamente profesionales habilitados por la plataforma para el mercado Cartagena;
- cumplir las condiciones del medio de pago habilitado para la beta.

La invitación a la beta no garantiza disponibilidad permanente de veterinarios, horarios o servicios.

## 3. Naturaleza del servicio

Nvet Care facilita coordinación tecnológica entre usuarios y profesionales veterinarios. Las decisiones clínicas corresponden al veterinario responsable de cada atención. Las funciones de orientación automatizada o inteligencia artificial son herramientas de apoyo y no sustituyen valoración, diagnóstico ni criterio profesional.

## 4. Emergencias

La beta no debe utilizarse como único canal para gestionar una emergencia veterinaria. Ante signos graves o riesgo inmediato, el usuario debe buscar atención veterinaria de urgencia sin retrasarla por esperar una respuesta de la aplicación.

## 5. Reservas, cambios y suspensión operacional

Nvet Care puede detener temporalmente nuevas reservas mediante su control operacional cuando exista un incidente de seguridad, integridad de datos, pagos, disponibilidad o continuidad del servicio. Esta medida no pretende eliminar el acceso del usuario a su cuenta, historial o citas ya existentes.

Las reglas de cancelación, reprogramación y disputa que aparezcan en la aplicación forman parte del flujo operativo de la reserva correspondiente.

## 6. Pagos durante la beta

Solo podrán utilizarse medios de pago expresamente habilitados para la beta. Un medio visible en código, pruebas o entornos de staging no debe interpretarse como habilitado en producción. La plataforma puede mantener medios de pago bloqueados hasta completar su certificación operativa.

## 7. Conducta y uso permitido

El participante se compromete a proporcionar información razonablemente veraz, no intentar eludir controles de acceso, no interferir con la operación del servicio y no utilizar la beta para actividades fraudulentas, abusivas o contrarias a la seguridad de usuarios, profesionales o animales.

## 8. Feedback y observación

La beta busca identificar errores, fricción y oportunidades de mejora. Nvet Care puede utilizar métricas de producto, incidencias y comentarios de los participantes para evaluar estabilidad, seguridad y experiencia, de acuerdo con el aviso de privacidad vigente.

## 9. Cambios de versión

Si estos términos o el aviso de privacidad cambian de versión, Nvet Care puede exigir una nueva aceptación explícita antes de permitir nuevas reservas. La aceptación de una versión anterior no se trata como aceptación automática de una versión posterior.

## 10. Soporte y escalamiento

El canal operativo de soporte de la beta debe configurarse antes del lanzamiento y comunicarse desde la aplicación o por el canal oficial definido para la cohorte. Los incidentes críticos siguen el runbook `docs/production/CARTAGENA_BETA_OPERATIONS_RUNBOOK.md`.

## 11. Aceptación

La aceptación debe realizarse mediante una acción afirmativa en la aplicación. El backend registra en un log append-only la identidad de cuenta, la versión de términos, la versión de privacidad y la fecha/hora de aceptación. La ausencia de aceptación vigente bloquea nuevas reservas mientras la beta esté activa.
