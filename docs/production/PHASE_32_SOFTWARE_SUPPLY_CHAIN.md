# Phase 32 — Software Supply Chain & Artifact Provenance

Phase 32 endurece la cadena de suministro de Nvet Care sin alterar la lógica funcional del candidato congelado `1.0.0-rc.2`.

## Objetivo

Cada release debe poder responder de forma verificable a cuatro preguntas: **qué dependencias contiene, qué entradas exactas lo produjeron, qué hash identifica cada evidencia y qué workflow/commit produjo el artefacto**.

La fase incorpora un SBOM SPDX, un manifiesto SHA-256 de entradas críticas, validación del `package-lock.json`, provenance firmada mediante GitHub Artifact Attestations/Sigstore y una attestation que vincula el AAB Android con su SBOM.

## Alcance automatizable

Phase 32 valida y produce:

- `package-lock.json` v3 como fuente canónica del árbol npm;
- rechazo de dependencias resueltas mediante transportes inseguros;
- integridad criptográfica para dependencias descargadas desde registries HTTPS;
- SBOM SPDX generado con `npm sbom`;
- SHA-256 de entradas críticas de release;
- reporte canónico de supply chain;
- provenance del paquete de evidencia Phase 32;
- provenance del AAB Android cuando el workflow real de release sea ejecutado;
- SBOM attestation vinculada al AAB;
- acciones críticas de GitHub fijadas a SHA inmutable en los workflows de Phase 32 y Android release.

## Acciones fijadas

La política usa referencias SHA, no tags mutables, para:

- `actions/checkout`;
- `actions/setup-node`;
- `actions/setup-java` en el build Android;
- `actions/upload-artifact`;
- `actions/attest`.

El verificador compara el contenido de los workflows contra los SHA declarados en el contrato canónico. Un cambio de versión debe hacerse explícitamente en el contrato y en el workflow correspondiente.

## Evidencia generada

El workflow produce `.artifacts/phase32/` con:

- `npm-sbom.spdx.json`;
- `release-inputs.sha256`;
- `supply-chain-report.json`.

En `main` o mediante `workflow_dispatch`, GitHub firma attestations usando OIDC/Sigstore. Los PR validan el contrato y generan evidencia, pero no firman artefactos de una rama no integrada.

## Android Release

`release-android.yml` conserva todos sus límites existentes y añade:

1. generación del SBOM SPDX desde el lockfile del tag inmutable;
2. checksum del SBOM dentro del artifact de release;
3. provenance attestation del AAB firmado;
4. SBOM attestation del mismo AAB;
5. referencias SHA inmutables para las GitHub Actions críticas.

La attestation ocurre después de verificar la firma del AAB. No sustituye Play App Signing, el certificado de upload ni la evidencia de instalación física.

## Límites

Phase 32 **no**:

- modifica comportamiento de backend, mobile o dashboard;
- instala secretos en el repositorio;
- crea evidencia bancaria, beta o de dispositivo;
- configura Google Play Console;
- publica al track production;
- autoriza lanzamiento comercial.

Su resultado es evidencia técnica de origen e integridad, no autorización operacional.
