# Fase 13 — Android Production

**Estado:** infraestructura de release, Internal Testing y compliance técnico desplegadas; publicación pública en Google Play bloqueada hasta completar evidencia externa y el mecanismo de eliminación de cuenta.

## Objetivo

Convertir la base Android existente en un artefacto de producción reproducible, firmado, trazable y declarable en Google Play sin saltar los gates de Release Candidate, firma, privacidad, Data Safety, acceso de revisores, eliminación de cuenta ni validación física.

## Baseline técnico

La aplicación mantiene `applicationId = com.nvetcare`, JDK 17 y React Native actual del monorepo. El baseline Android es:

- `compileSdkVersion = 36`;
- `targetSdkVersion = 36`;
- Android Gradle Plugin `8.10.1`;
- Gradle wrapper `8.11.1`.

No se introduce AGP 9 ni una migración mayor de React Native dentro de la ventana de estabilización del release.

## Compatibilidad Android 16 / API 36

El review de cambios de comportamiento de Android 16 queda versionado en `docs/production/ANDROID_16_BEHAVIOR_REVIEW.md` y protegido por `scripts/verify-android16-compatibility.mjs`.

Para la ventana de estabilización 1.0:

- edge-to-edge permanece habilitado y no se usa el opt-out eliminado por API 36;
- `SafeAreaProvider` permanece como contrato raíz para manejo de insets;
- predictive back se desactiva temporalmente con `android:enableOnBackInvokedCallback="false"` hasta migrar y certificar navegación en dispositivos;
- la app continúa phone-first y usa `android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY=true` mientras no exista certificación específica de tablet/foldable;
- el deep link móvil continúa restringido al esquema `nvetcare://`;
- el manifest auditado solo declara Internet y ubicación aproximada/precisa.

Esta evidencia cierra `android16BehaviorReviewCompleted`, pero no sustituye pruebas físicas ni evidencia de Play Console.

## Fase 13A — firma y artefacto reproducible

`.github/workflows/release-android.yml` es el único pipeline de artefacto Android de producción. Su frontera de firma exige tag inmutable, keystore efímero, fingerprint SHA-256 fijado, AAB firmado, verificación con `jarsigner`, checksum y metadata de trazabilidad. El material de firma no se escribe dentro del workspace del repositorio y se elimina antes de distribuir el artefacto.

## Fase 13B — handoff a Internal Testing

El mismo workflow puede, únicamente mediante `workflow_dispatch` y `publish_internal=true`, subir el AAB firmado al track `internal` con estado `draft` usando una service account dedicada. La automatización no puede seleccionar el track de producción ni promover automáticamente una release.

El procedimiento operativo está documentado en `docs/production/ANDROID_PLAY_INTERNAL_RUNBOOK.md`.

## Fase 13C — Google Play Compliance & Release Evidence

Phase 13C introduce una fuente de verdad de compliance independiente de las declaraciones manuales de Play Console:

- `docs/production/ANDROID_PLAY_COMPLIANCE.json`: inventario machine-readable de permisos, SDKs y flujos de datos;
- `scripts/audit-android-play-compliance.mjs`: auditor fail-closed que compara el inventario con el manifest Android, dependencias y servicios móviles reales;
- `docs/production/GOOGLE_PLAY_DATA_SAFETY.md`: matriz de ingeniería para completar Data Safety sin inventar categorías o proveedores;
- `docs/production/NVET_PRIVACY_POLICY_SOURCE.md`: texto canónico de política de privacidad, todavía no considerado publicado;
- `docs/production/ANDROID_PLAY_REVIEWER_ACCESS.md`: procedimiento de acceso CLIENT/VET para revisión sin credenciales privilegiadas ni secretos en Git;
- cada ejecución firmada genera `android-play-compliance.json` y su SHA-256 junto al AAB y a `release-metadata.json`.

El auditor protege específicamente contra drift de permisos sensibles. Si aparecen background location, cámara, micrófono, contactos, almacenamiento amplio, notificaciones runtime u otra capacidad no declarada, el contrato deja de pasar hasta que la nueva superficie sea revisada y documentada.

La Fase 13C también identifica de forma explícita un blocker que antes no estaba modelado: Nvet Care permite crear cuentas, pero el baseline auditado no demuestra todavía un flujo móvil de eliminación de cuenta junto con un endpoint backend correspondiente y la ruta pública requerida. Por tanto `accountDeletionAvailable` permanece `pending` y no puede presentarse en Play Console como una capacidad existente.

## Cadena de release

La cadena canónica queda:

1. ejecución manual confirmada;
2. versión SemVer y tag inmutable `v<version>` coincidentes;
3. checkout del tag;
4. auditoría de compliance Phase 13C sobre ese mismo tag;
5. dependencias instaladas desde lockfile;
6. keystore efímero y firma fail-closed;
7. validación de fingerprint SHA-256;
8. build y verificación criptográfica del AAB;
9. checksum del AAB;
10. evidencia Phase 13C y checksum de compliance;
11. metadata que enlaza versión, git SHA, API, target SDK y hash de compliance;
12. borrado del keystore;
13. artifact de GitHub Actions;
14. opcionalmente, draft en Google Play Internal Testing;
15. ninguna promoción automática a producción.

## Contrato de readiness

`docs/production/ANDROID_PRODUCTION_READINESS.json` continúa siendo la fuente de verdad de activación. `scripts/verify-android-production-readiness.mjs` y `scripts/audit-android-play-compliance.mjs` separan dos clases de evidencia:

**Evidencia interna verificable por CI:** baseline Android 16, firma/release boundary, inventario de permisos/datos y contrato Phase 13C.

**Evidencia externa que CI no puede fabricar:** Play Console, Play App Signing, upload certificate real, URL pública de privacidad, Data Safety efectivamente revisado, eliminación de cuenta operativa, acceso real de revisores, AAB firmado real, Internal Testing y smoke físico.

La Fase 13 no puede declararse READY si falta cualquiera de los gates externos requeridos. Un documento preparado no equivale a una declaración publicada, y un pipeline capaz de firmar no equivale a un AAB firmado real.

## Secuencia de rollout

La secuencia segura es:

`compliance técnico → eliminación de cuenta → privacidad/Data Safety → RC aprobado → tag inmutable → AAB firmado → draft Internal → revisión/aprobación interna → observación mínima 24h → smoke físico → rollout controlado → observabilidad post-release`.

No se debe crear un tag de producción mientras existan blockers P0/P1 que afecten autenticación, reservas, datos, pagos, eliminación de cuenta o rollback.

## Rollback

El rollback operativo conserva dos niveles independientes:

- detener nuevas reservas con `NVET_BOOKING_ENABLED=false` sin cortar autenticación ni historial;
- detener o pausar el rollout en Google Play sin revocar el backend compartido ni la web de `ctgone.com/nvetcareapp`.

Una publicación móvil nunca debe modificar por sí sola el esquema de producción ni convertirse en requisito para que la web siga operando.

## Criterio de salida

La fase termina únicamente cuando `Android Production Readiness` puede ejecutarse con `enforce=true` y concluir `success`, existe evidencia de un AAB firmado en un track no productivo, la política/Data Safety y eliminación de cuenta están verificadas, y el candidato fue probado en dispositivos físicos. La existencia de un AAB técnico generado por CI no satisface este criterio.
