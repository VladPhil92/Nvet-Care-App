# Fase 13 — Android Production

**Estado:** infraestructura de release en desarrollo; compatibilidad Android 16 revisada; publicación pública en Google Play bloqueada hasta completar evidencia externa.

## Objetivo

Convertir la base Android existente en un artefacto de producción reproducible, firmado y trazable, apto para un rollout controlado en Google Play sin saltar los gates de Release Candidate, seguridad de firma, privacidad ni validación física.

## Baseline técnico de esta fase

La aplicación mantiene `applicationId = com.nvetcare`, JDK 17 y React Native actual del monorepo. Para cumplir el baseline de distribución vigente se eleva Android a:

- `compileSdkVersion = 36`;
- `targetSdkVersion = 36`;
- Android Gradle Plugin `8.10.1`;
- Gradle wrapper `8.11.1`.

No se introduce AGP 9 ni una migración mayor de React Native dentro de la ventana de estabilización del release. La prioridad es cumplir API 36 con el menor cambio de superficie compatible.

## Compatibilidad Android 16 / API 36

El review de cambios de comportamiento de Android 16 queda versionado en `docs/production/ANDROID_16_BEHAVIOR_REVIEW.md` y protegido por `scripts/verify-android16-compatibility.mjs`.

Para la ventana de estabilización 1.0:

- edge-to-edge permanece habilitado y no se usa el opt-out eliminado por API 36;
- `SafeAreaProvider` permanece como contrato raíz para manejo de insets;
- predictive back se desactiva temporalmente de forma explícita con `android:enableOnBackInvokedCallback="false"` hasta migrar y certificar la navegación en dispositivos;
- la app continúa phone-first y usa el modo de compatibilidad `android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY=true` mientras no exista una certificación específica de tablet/foldable;
- el deep link móvil continúa restringido al esquema `nvetcare://`;
- no se agregan permisos de red local, Health Connect ni almacenamiento amplio que el producto 1.0 no necesita.

Esta evidencia cierra el gate documental/técnico `android16BehaviorReviewCompleted`, pero **no** sustituye `physicalDeviceSmokeVerified`, `dataSafetyReviewed` ni ninguna evidencia de Play Console.

## Cadena de release

`.github/workflows/release-android.yml` es el único pipeline de artefacto Android de producción. Su contrato es deliberadamente más estricto que el build técnico de CI:

1. ejecución manual confirmada;
2. versión SemVer y tag inmutable `v<version>` coincidentes;
3. checkout del tag, no de una rama mutable;
4. dependencias instaladas desde el lockfile canónico;
5. keystore de upload materializado únicamente dentro del runner efímero desde GitHub Secrets;
6. `NVET_ANDROID_REQUIRE_SIGNING=true`, por lo que un build publicable falla si falta cualquiera de los cuatro parámetros de firma o si el archivo de keystore no existe;
7. fingerprint SHA-256 comparado contra `ANDROID_UPLOAD_CERT_SHA256` antes del build;
8. AAB firmado con la upload key aprobada;
9. verificación criptográfica con `jarsigner -verify`; el certificado puede ser self-signed, por lo que la identidad del signer se demuestra separadamente mediante el fingerprint SHA-256 fijado;
10. generación de checksum SHA-256 y metadata de trazabilidad;
11. borrado explícito del keystore efímero antes de distribuir el artefacto;
12. conservación del AAB firmado y su evidencia como artifact de GitHub Actions;
13. opcionalmente, con `publish_internal=true`, subida del mismo AAB al track `internal` de Google Play con estado `draft` y una service account dedicada;
14. ninguna promoción automática al track de producción.

El handoff a Google Play Internal Testing es deliberadamente opcional y manual. Un PR, un push o un CI normal no puede realizarlo. Requiere un `workflow_dispatch`, tag inmutable, secretos de firma válidos y la credencial de Play configurada en el environment `production`. El procedimiento operativo está documentado en `docs/production/ANDROID_PLAY_INTERNAL_RUNBOOK.md`.

## Contrato de readiness

`docs/production/ANDROID_PRODUCTION_READINESS.json` es la fuente de verdad de activación. El verificador `scripts/verify-android-production-readiness.mjs` comprueba tanto el contrato versionado como evidencia viva de GitHub Actions. También protege el modo fail-closed de firma, el uso de keystore efímero, la exclusión de material `.jks`/`.keystore` del repositorio y que la automatización de Play permanezca limitada a `track: internal` + `status: draft`.

La Fase 13 no puede declararse READY si falta cualquiera de estas evidencias:

- Release Candidate promovido;
- aplicación `com.nvetcare` creada en Play Console;
- Play App Signing habilitado;
- upload certificate fijado y validado;
- política de privacidad publicada;
- Data safety revisado;
- AAB firmado verificado;
- AAB cargado en track interno;
- smoke test en mínimo dos dispositivos físicos;
- revisión de cambios de comportamiento Android 16/API 36.

## Secuencia de rollout

La secuencia segura es:

`RC aprobado → tag inmutable → AAB firmado → draft en track interno → revisión/aprobación interna → observación mínima 24h → smoke físico → rollout controlado → observabilidad post-release`.

No se debe crear un tag de producción mientras Fase 11/12 mantenga blockers P0/P1 que afecten autenticación, reservas, datos, pagos o capacidad de rollback.

## Rollback

El rollback operativo conserva dos niveles independientes:

- detener nuevas reservas con `NVET_BOOKING_ENABLED=false` sin cortar autenticación ni historial;
- detener/pausar el rollout en Google Play sin revocar el backend compartido ni la web de `ctgone.com/nvetcareapp`.

Una publicación móvil nunca debe modificar por sí sola el esquema de producción ni convertirse en requisito para que la web siga operando.

## Criterio de salida

La fase termina únicamente cuando `Android Production Readiness` puede ejecutarse con `enforce=true` y concluir `success`, y existe evidencia de un AAB firmado validado en un track no productivo y probado en dispositivos físicos. La existencia de un AAB técnico generado por CI no satisface este criterio.
