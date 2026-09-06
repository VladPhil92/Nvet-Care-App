# Nvet Care — Google Play Internal Testing runbook

This runbook defines the one-time operator boundary required before the repository can upload signed Nvet Care Android bundles to Google Play Internal Testing.

The automated workflow is `.github/workflows/release-android.yml`. It builds from an immutable `v<version>` tag, verifies the approved upload certificate, creates SHA-256/metadata evidence, and can optionally upload the signed AAB to the `internal` track as a **draft**. It never promotes a release to production.

## Canonical Android identity

- Application ID / package: `com.nvetcare`
- Target SDK: 36
- Release artifact: Android App Bundle (`.aab`)
- GitHub environment: `production`

Do not create a second Play package for the same Nvet Care application.

## One-time operator setup

### 1. Create/claim the application in Play Console

Create the Nvet Care application in the intended Google Play developer account with package `com.nvetcare`.

Google Play automation cannot bootstrap a package that does not yet exist in the developer account. If the Android Publisher API rejects the first automated upload because the package has no initial Console release, upload one approved signed AAB manually through Play Console, then keep subsequent uploads automated.

### 2. Configure Play App Signing

Enable Play App Signing for `com.nvetcare` and register/retain the approved upload key used by the repository release workflow.

The repository must continue to hold the matching release secrets in the GitHub `production` environment:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_UPLOAD_CERT_SHA256`

The release workflow fails closed when the decoded upload certificate fingerprint does not equal `ANDROID_UPLOAD_CERT_SHA256`.

### 3. Enable Google Play Developer API access

In the Google Cloud project used for release automation:

1. enable the Google Play Android Developer API;
2. create a dedicated service account for Nvet Care release automation;
3. keep the service account dedicated to release duties rather than reusing an unrelated owner/admin identity.

### 4. Grant the service account only the required Play permissions

In Play Console → **Users and permissions**, invite the service-account email and scope access to the Nvet Care application.

Grant only the permissions required to manage releases in testing tracks. Do not grant account-wide financial, user-management, or production-release permissions unless a later documented phase explicitly requires them.

### 5. Store the Play credential in GitHub

In GitHub → `VladPhil92/Nvet-Care-App` → Settings → Environments → `production`, add:

`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`

The value must be the complete JSON credential for the dedicated service account. Do not commit the JSON file or paste it into issues, pull requests, workflow logs, or documentation.

### 6. Configure the real Maps provider key

The signed release workflow also requires:

`GOOGLE_MAPS_ANDROID_API_KEY`

The key must be a real Maps SDK for Android key restricted to the Nvet Care package/signing certificate. The synthetic no-tiles key used by lifecycle CI is not valid release evidence.

## Automated Internal Testing upload

After the one-time setup is complete:

1. create an immutable release tag matching the requested public version, e.g. `v1.0.0`;
2. run **Release Android**;
3. set `confirm` to `release`;
4. set `version_name` and `release_ref` to matching values;
5. provide the production backend HTTPS URL ending in `/api`;
6. set `publish_internal` to `true`.

The workflow then:

1. checks out the immutable tag;
2. validates release secrets and the API URL;
3. validates the Play service-account credential shape;
4. verifies the upload certificate fingerprint;
5. builds and verifies the signed AAB;
6. writes checksum and release metadata evidence;
7. uploads the AAB to Google Play `internal` with status `draft`;
8. retains the signed artifact/evidence in GitHub Actions.

## Manual action after each draft upload

The workflow intentionally stops at a Play **draft**. An authorized operator must review the Play Console release state, policy warnings, tester scope, Data Safety/store-listing requirements, and then explicitly complete/promote the internal release when appropriate.

Do not change the workflow to automatic production promotion as part of routine CI.

## Evidence required before public launch

Retain dated evidence for:

- Play App Signing enabled for `com.nvetcare`;
- approved upload certificate fingerprint;
- successful signed AAB workflow run;
- successful Internal Testing upload;
- installation from Google Play on at least one physical Android device;
- login and CLIENT/VET lifecycle smoke test on that installed build;
- real Maps tile rendering on the installed signed build;
- current privacy policy and Data Safety declarations.

Internal Testing evidence is a release gate; it is not equivalent to public-production certification.
