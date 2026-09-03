# Fase 12B — Beta Consent UX & Participant Onboarding

**Estado:** DESARROLLADA / NO ACTIVA COMERCIALMENTE  
**Dependencia:** Fase 12A Privacy, Support & Rollback Certification  
**Mercado:** Cartagena de Indias

## Objetivo

Convertir el contrato de consentimiento versionado de la beta en una experiencia de usuario explícita, accesible y fail-closed dentro del flujo real de reserva, sin mover la autoridad del consentimiento al dispositivo.

## Frontera de producto

El punto de consentimiento se ubica inmediatamente antes de seleccionar el medio de pago. El participante puede configurar servicio, fecha, mascota y dirección, pero no puede seleccionar un rail de pago mientras la aplicación no haya confirmado:

1. que el runtime opera en `closed-beta`;
2. que el backend pudo devolver la versión legal vigente;
3. que la cuenta tiene aceptación vigente, o que la aceptación explícita acaba de ser registrada server-side.

En modo `standard`, el selector conserva el comportamiento anterior y no introduce una barrera legal adicional.

## Contrato server-authoritative

La app móvil consume:

- `GET /api/beta/policy` para conocer el modo operativo;
- `GET /api/beta/legal` para recuperar versiones y estado de aceptación;
- `POST /api/beta/legal/accept` para registrar la acción afirmativa.

La app no guarda un booleano local de aceptación en AsyncStorage, Keychain u otro storage del dispositivo. El estado vuelve a resolverse contra backend para evitar que una aceptación antigua sobreviva indebidamente a una nueva versión de términos o privacidad.

## UX de consentimiento

Cuando la beta está activa y falta aceptación vigente, la pantalla de pago muestra:

- identificación visible de la Beta Cerrada Cartagena;
- explicación de por qué la reserva está limitada;
- resumen material de responsabilidades clínicas, emergencias, suspensión operacional y reaceptación por versión;
- versiones vigentes de términos y privacidad;
- CTA afirmativo `Acepto y continuar`;
- estado de error/reintento si la política o el consentimiento no pueden verificarse.

Después de una aceptación exitosa, React Query actualiza el estado canónico en memoria y habilita el rail sin exigir recarga de pantalla.

## Fail-closed

Si falla la consulta de política o del consentimiento durante `closed-beta`, los métodos de pago permanecen deshabilitados. La UI no degrada silenciosamente a modo abierto.

Además, el backend sigue siendo la frontera de seguridad: `ClosedBetaAccessService` exige aceptación vigente antes de crear una cita. Por tanto, un cliente modificado o una omisión de la UI no puede eludir el gate.

## Accesibilidad

Los métodos bloqueados informan estado `disabled` y el motivo de bloqueo en su `accessibilityLabel`. Los cambios de validación beta usan `accessibilityLiveRegion="polite"` para que lectores de pantalla reciban feedback de carga, error y aceptación.

## Gate de promoción

La fase se promueve únicamente si pasan:

- `Beta Consent UX Certification`;
- `CI Success`;
- `Railway Contract` cuando aplique al diff;
- los gates heredados de seguridad y beta que el CI general ejecute.

Esta fase **no** cambia `privacyAndTermsReviewed`, `supportOwnerConfirmed`, `rollbackDrillVerified` ni ningún gate externo del Release Candidate. Implementar la UX no equivale a revisión jurídica ni a activación comercial.
