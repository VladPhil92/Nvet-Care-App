# Nvet Care — Privacy Policy publication source

**Phase:** 13D  
**Publication status:** `PENDING`  
**Play evidence status:** this file is source material only and MUST NOT be cited as a public privacy-policy URL.

Before publication, the release owner must attach a verified public HTTPS URL, a monitored privacy-contact channel, the effective date, and the legal controller/operator identity used for the production service. Once published, the public text must remain materially aligned with `ANDROID_PLAY_COMPLIANCE.json` and `GOOGLE_PLAY_DATA_SAFETY.md`.

---

## Política de Privacidad de Nvet Care — texto canónico para publicación

Nvet Care es una plataforma para coordinar servicios veterinarios, gestionar mascotas, comunicarse con profesionales veterinarios y utilizar funciones relacionadas con citas, ubicación, pagos y asistencia tecnológica. Esta política describe las categorías de información que el producto puede tratar, los fines asociados y el ciclo de vida de la cuenta.

### 1. Información de cuenta y perfil

Para crear y operar una cuenta, Nvet Care puede tratar datos como correo electrónico, nombre, apellido, teléfono, imagen de perfil, rol de usuario y estados de seguridad de la cuenta. En perfiles veterinarios también pueden tratarse datos profesionales como número de licencia, especialidades, estado de verificación y calificaciones.

Estos datos se utilizan para autenticación, administración de cuenta, seguridad, verificación profesional, soporte y prestación del servicio.

### 2. Información sobre mascotas y atención veterinaria

Los usuarios pueden registrar información sobre sus mascotas, incluyendo nombre, especie, raza, peso, fecha de nacimiento, fotografías y notas. Durante una cita pueden generarse o registrarse datos adicionales, por ejemplo diagnóstico, tratamiento y notas clínicas veterinarias.

Esta información se usa para prestar y dar continuidad a los servicios veterinarios y para mostrar a profesionales autorizados el contexto necesario de una cita.

### 3. Ubicación

La aplicación puede solicitar ubicación aproximada o precisa cuando una función la necesita. Los usos previstos incluyen mostrar veterinarios cercanos y permitir seguimiento de ubicación durante una cita activa.

El acceso a ubicación depende del permiso otorgado por el usuario. La versión Android auditada para esta política no declara permiso de ubicación en segundo plano.

### 4. Citas, direcciones y comunicaciones

Nvet Care puede tratar fechas y horas de citas, dirección del servicio, estado de la cita y comunicaciones entre cliente y veterinario. Los mensajes pueden incluir texto, información de precios y reportes de contenido enviados por los participantes.

Estos datos se utilizan para coordinar el servicio, mantener la comunicación, resolver incidencias y aplicar controles de confianza y seguridad.

### 5. Pagos y transacciones

Cuando un usuario utiliza funciones financieras, Nvet Care puede tratar método de pago, importes, estados de transacción, comprobantes de transferencia y datos necesarios para retiros o conciliación. Dependiendo del método elegido, determinada información también puede ser procesada por proveedores financieros o de pagos.

La clasificación exacta de los proveedores activos y sus políticas de conservación debe verificarse contra la configuración real de producción antes de publicar la declaración final de Google Play.

### 6. Archivos e imágenes seleccionados por el usuario

La aplicación puede permitir que el usuario seleccione imágenes o archivos para funciones concretas, por ejemplo un comprobante de transferencia o contenido asociado al perfil o servicio. El acceso ocurre como consecuencia de una acción del usuario y debe limitarse al archivo seleccionado o al mecanismo permitido por el sistema operativo.

### 7. Funciones de inteligencia artificial

Algunas funciones pueden utilizar preguntas del usuario y contexto relacionado con mascotas o citas para generar orientación, apoyo previo a una consulta, soporte al análisis veterinario o borradores de documentación. Estas funciones no sustituyen el juicio profesional veterinario ni deben operar como prescripción autónoma.

Antes de publicar esta política, el operador debe verificar y describir de forma consistente el proveedor de IA activo, las reglas de almacenamiento/retención aplicables y cualquier transferencia de datos asociada.

### 8. Información técnica y seguridad

El servicio puede tratar tokens de sesión, información necesaria para autenticación multifactor, etiquetas de dispositivo y metadatos de sesión con fines de autenticación, prevención de abuso, protección de cuentas y trazabilidad operativa.

La aplicación puede conservar localmente información de sesión y perfil necesaria para mantener una experiencia autenticada. Al eliminar una cuenta, las sesiones Nvet se eliminan y el perfil operativo deja de ser utilizable para autenticación.

### 9. Notificaciones y actividad del servicio

Nvet Care puede mantener un buzón de notificaciones relacionado con citas, pagos, recordatorios preventivos u otros eventos del servicio, incluyendo estado de lectura y ruta de acción. La versión Android de referencia utiliza un buzón interno; cualquier incorporación futura de notificaciones push deberá actualizar esta política y la declaración de Google Play cuando corresponda.

### 10. Proveedores y encargados de tratamiento

El servicio puede utilizar proveedores de infraestructura, almacenamiento, mapas, comunicaciones, pagos, monitoreo o inteligencia artificial. La lista y función de los proveedores activos debe corresponder con la configuración real de producción y con la declaración vigente de Google Play.

La eliminación del perfil Nvet no debe describirse como prueba de borrado inmediato en todos los proveedores externos mientras no se haya verificado el ciclo de vida de los objetos y datos procesados por cada proveedor. Esa revisión permanece como evidencia externa de producción.

### 11. Conservación y pseudonimización

La información operativa se conserva únicamente durante el tiempo necesario para prestar el servicio, mantener seguridad e integridad, cumplir obligaciones aplicables o resolver disputas. Cuando una cuenta se elimina, Nvet Care borra credenciales, sesiones, datos de contacto del perfil, tokens de verificación/recuperación, notificaciones y otros datos operativos que ya no deban conservarse.

Determinados **registros clínicos, financieros, profesionales o de auditoría** pueden necesitar conservación por continuidad veterinaria, trazabilidad profesional, prevención de fraude, conciliación, seguridad u obligaciones legales. En esos casos, el sistema mantiene un identificador interno pseudónimo e inactivo para preservar integridad referencial sin permitir un nuevo inicio de sesión con la cuenta eliminada. Los datos de mascotas sin historial de citas pueden eliminarse; los vinculados a historias clínicas se reducen y pseudonimizan para conservar únicamente la continuidad necesaria del registro.

### 12. Derechos, acceso, corrección y eliminación

La **eliminación de cuenta de autoservicio está implementada** en Nvet Care. Un usuario autenticado puede acceder a **Perfil → Privacidad y cuenta → Eliminar cuenta**. El flujo informa qué categorías se eliminan y cuáles pueden conservarse, exige la frase de confirmación `ELIMINAR MI CUENTA`, solicita la contraseña actual en cuentas con contraseña local y exige TOTP cuando la autenticación de dos factores está habilitada.

Para evitar pérdida de registros o fondos durante una operación abierta, el sistema bloquea temporalmente la eliminación si existen citas activas o en disputa, transacciones pendientes/en verificación/en disputa, saldo de wallet sin regularizar o retiros veterinarios abiertos. Una vez resueltas esas obligaciones, el usuario puede repetir el proceso.

El backend incorpora además la ruta pública de información `/api/privacy/account-deletion`. La presencia de esa ruta en el código no equivale por sí sola a evidencia de que la URL de producción esté publicada y disponible: su verificación en el dominio productivo y su registro en Google Play permanecen como evidencia externa antes del lanzamiento público.

### 13. Menores de edad

La audiencia objetivo y cualquier uso por menores deben ser definidos y revisados en Google Play Console antes del lanzamiento. No se debe declarar una audiencia infantil o tratamiento dirigido a menores sin completar la evaluación de producto, contenido y cumplimiento correspondiente.

### 14. Cambios de la política

La política puede actualizarse cuando cambien las funciones, los proveedores, las categorías de datos o los requisitos regulatorios y de la tienda. La versión pública debe indicar su fecha de vigencia y mantener un mecanismo razonable para comunicar cambios materiales.

### 15. Contacto

La versión pública debe incluir un canal de contacto de privacidad verificado y monitoreado. Ese dato no se incluye en esta fuente de repositorio para evitar inventar o publicar un contacto no confirmado.
