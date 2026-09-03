# Nvet Care — Aviso de Privacidad Beta Cerrada Cartagena

**Versión:** `cartagena-beta-privacy-v1-2026-09-03`  
**Vigencia técnica:** 3 de septiembre de 2026  
**Estado:** BORRADOR OPERATIVO — REVISIÓN JURÍDICA PENDIENTE

> Este aviso documenta el comportamiento técnico previsto para la beta. No certifica por sí mismo cumplimiento legal. El gate `privacyAndTermsReviewed` debe permanecer `pending` hasta completar y documentar la revisión responsable aplicable en Colombia.

## 1. Datos tratados durante la beta

Según el rol y las funciones utilizadas, Nvet Care puede tratar:

- datos de cuenta y contacto proporcionados por el usuario;
- rol de usuario o veterinario;
- datos de las mascotas registrados por sus responsables;
- información necesaria para reservas y prestación del servicio;
- información clínica documentada por profesionales veterinarios;
- ubicación cuando el usuario habilita funciones que la requieren;
- información operativa de pagos y comprobantes cuando corresponda;
- eventos de seguridad, sesiones y auditoría necesarios para proteger la plataforma;
- aceptación versionada de términos y privacidad;
- métricas técnicas e incidencias de la beta.

## 2. Finalidades de la beta

Los datos se utilizan para:

- autenticar y proteger cuentas;
- coordinar reservas y servicios veterinarios;
- verificar profesionales antes de habilitar funciones clínicas u operativas;
- procesar y auditar los medios de pago efectivamente habilitados;
- prestar soporte y responder incidentes;
- detectar fraude, abuso, errores y fallos de seguridad;
- evaluar estabilidad y experiencia de la beta;
- cumplir obligaciones aplicables y atender solicitudes legítimas relacionadas con datos personales.

## 3. Minimización

La beta aplica controles de minimización diseñados para evitar exposición innecesaria. Entre ellos:

- la cohorte de clientes se configura mediante hashes SHA-256 de identificadores internos y los endpoints de readiness solo exponen conteos agregados;
- las vistas públicas de veterinarios no deben revelar datos privados no necesarios para descubrimiento;
- documentos de verificación y comprobantes sensibles usan almacenamiento privado y acceso autenticado;
- el contexto del copilot veterinario evita enviar nombre y apellido del cliente cuando no son necesarios para la tarea clínica;
- los logs del proveedor de IA no deben incluir prompts clínicos por decisión del runtime de Nvet Care.

## 4. Inteligencia artificial

Cuando se utiliza asistencia de IA, Nvet Care envía únicamente el contexto previsto por la función correspondiente. El producto solicita que el proveedor no almacene la respuesta por el mecanismo configurado en la integración y aplica reglas locales de seguridad. La IA no sustituye la atención veterinaria ni constituye por sí sola una decisión clínica.

## 5. Ubicación

La ubicación se utiliza únicamente en las funciones que la necesitan, por ejemplo búsqueda por proximidad o seguimiento asociado a una cita. Los permisos del dispositivo pueden revocarse desde el sistema operativo. La beta no debe utilizar coordenadas exactas como dato público de perfil.

## 6. Evidencia de consentimiento

La aceptación de este aviso y de los términos de beta se registra de forma versionada. El registro contiene el identificador interno de la cuenta, versiones aceptadas y fecha/hora. No se considera vigente una aceptación de versiones anteriores cuando el contrato técnico exige una versión posterior.

## 7. Retención y eliminación

La retención debe corresponder a la finalidad del dato, obligaciones aplicables, seguridad y resolución de disputas. Antes del lanzamiento público debe existir una política de retención aprobada para cada categoría relevante. La beta no autoriza conservar indefinidamente datos que hayan dejado de ser necesarios.

## 8. Proveedores y transferencias técnicas

Nvet Care puede utilizar proveedores de infraestructura, almacenamiento, comunicaciones, observabilidad, mapas o IA para operar funciones concretas. Solo deben habilitarse proveedores y configuraciones aprobados para el entorno correspondiente. Secretos, documentos privados y credenciales no deben incluirse en repositorios ni respuestas públicas.

## 9. Seguridad

La plataforma aplica autenticación, autorización por rol y estado profesional, validación de archivos, cifrado para determinadas categorías sensibles, logs de auditoría, límites de tasa, controles de despliegue y mecanismos de recuperación. Ningún control elimina completamente el riesgo; los incidentes se gestionan mediante los runbooks operativos del proyecto.

## 10. Derechos y contacto

Antes de lanzar la beta debe existir un canal oficial confirmado para solicitudes relacionadas con privacidad, soporte y ejercicio de derechos aplicables. Ese canal no se inventa en código: se configura y documenta como evidencia operacional antes de cambiar `privacyAndTermsReviewed` o `supportOwnerConfirmed` a `verified`.

## 11. Cambios

Toda modificación material debe generar una nueva versión. Cuando la nueva versión requiera aceptación, el backend bloqueará nuevas reservas en la beta hasta que el participante realice una acción afirmativa sobre la versión vigente.
