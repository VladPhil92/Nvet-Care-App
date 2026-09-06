# Android Public Release Runbook — Phase 13A

## Purpose

Phase 13A prepares a reproducible, signed Android App Bundle (AAB) for Nvet Care without publishing it to Google Play. Store submission remains an operator-controlled step after release-candidate evidence is complete.

## Release boundary

- Application ID: `com.nvetcare`
- App name: `Nvet Care`
- Default version: `1.0.0`
- Android target/compile SDK: API 36
- Production API: `https://backend-production-a476.up.railway.app`
- Publishable bundles must be signed. Unsigned release bundles remain permitted only in ordinary CI for packaging compatibility checks.
- The public-release workflow runs only from `main` and never uploads directly to Google Play.

## Required GitHub secrets

Configure these secrets before requesting a signed AAB:

- `NVET_ANDROID_KEYSTORE_BASE64` — base64 representation of the Android upload keystore.
- `NVET_ANDROID_KEYSTORE_PASSWORD`
- `NVET_ANDROID_KEY_ALIAS`
- `NVET_ANDROID_KEY_PASSWORD`
- `GOOGLE_MAPS_ANDROID_API_KEY` — production-restricted Android Maps key.

Never commit a `.jks`, `.keystore`, `keystore.properties`, password, or raw signing key to the repository.

## Build procedure

1. Confirm `main` is the intended release candidate and required technical checks are green.
2. Run the GitHub Actions workflow **Android Public Release Bundle** from `main`.
3. Set `version_name` to the semantic app version, for example `1.0.0`.
4. Set `version_code` to a positive monotonically increasing integer. Never reuse a code already uploaded to Google Play.
5. The workflow validates the release contract, materializes the keystore only inside the ephemeral runner, builds `bundleRelease`, verifies the JAR signature, generates a SHA-256 checksum, and uploads the result as `android-release-signed-aab`.
6. Retain the workflow run ID, commit SHA, versionName, versionCode, artifact digest/checksum, and operator who approved the candidate as release evidence.

## Store-submission prerequisites

Do not promote the AAB to a public production track until all applicable launch requirements are complete, including:

- provider-level production backup evidence and the controlled restore drill;
- final release-candidate approval;
- Google Play developer/account readiness;
- privacy policy URL and support contact;
- Play Data safety declarations matching actual runtime collection/sharing behavior;
- app-access instructions for review if authenticated areas require credentials;
- content rating, target audience and ads declarations as applicable;
- store listing title, short description, full description, icon, feature graphic, screenshots and contact details;
- internal/closed testing and physical-device smoke testing of the exact signed candidate;
- controlled real-payment evidence if payment functionality is included in the promoted release scope.

## Evidence produced by Phase 13A

The release workflow produces:

- signed `app-release.aab`;
- `android-release-sha256.txt`;
- `android-release-metadata.txt` containing versionName, versionCode and commit SHA.

This evidence proves packaging and signing provenance. It does **not** prove Google Play acceptance, production backup readiness, provider restore capability, real payment movement, or successful public rollout.

## Rollback / no-go conditions

Do not upload the bundle if any of these conditions apply:

- workflow executed from a branch other than `main`;
- versionCode is not strictly greater than the previous Play upload;
- signing secrets are incomplete or the keystore cannot be verified;
- API origin is not HTTPS production;
- Maps key is missing;
- checksum or signature verification fails;
- required RC external evidence remains intentionally blocking public promotion.
