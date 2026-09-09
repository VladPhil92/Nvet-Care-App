# Phase 13E — Android / Google Play Release Preflight

## Objective

Close every repository-only Android/Google Play preparation task that can be verified without fabricating external evidence from Google Play Console, a legal entity, signing credentials, physical devices, or a real payment provider.

This phase deliberately separates **technical readiness** from **operator/provider evidence**. A green preflight means the repository is ready for the external setup sequence; it does not mean the app is already publishable in Google Play.

## Machine-certified technical boundary

The Phase 13E verifier asserts that:

- the canonical package remains `com.nvetcare`;
- compile/target SDK remain API 36;
- publishable release signing fails closed when signing material is absent;
- the upload certificate fingerprint is pinned by the release workflow;
- release builds come from an immutable `v<version>` tag;
- the signed AAB is cryptographically verified;
- AAB and compliance evidence receive SHA-256 checksums;
- automated Google Play upload is limited to the `internal` track with `draft` status;
- automatic production promotion is prohibited;
- Android permissions remain limited to Internet + coarse/fine foreground location;
- no background location permission is declared;
- the repository privacy-policy source remains explicitly unpublished until legal identity/contact/date are known;
- the Data Safety matrix remains an engineering source, not a fabricated Play Console declaration;
- reviewer credentials remain external and non-secret;
- the account-deletion and Android 16 compatibility contracts remain implemented and verified.

The machine-readable contract is `docs/production/ANDROID_RELEASE_PREFLIGHT.json` and the verifier is `scripts/verify-android-release-preflight.mjs`.

## CI

`.github/workflows/android-release-preflight.yml` runs on relevant pull requests, relevant pushes to `main`, and manual dispatch. It produces `.artifacts/android-release-preflight.json` and uploads it as a short-lived GitHub Actions artifact.

The artifact reports:

- `technicalPreflight: READY`
- `externalReleaseEvidence: PENDING`

This distinction is mandatory. The workflow must never convert a Play/provider/operator gate to verified merely because repository files exist.

## External handoff intentionally left pending

The following work remains outside repository automation:

1. Final legal controller identity for the production privacy policy.
2. Creation/claim of `com.nvetcare` in the intended Google Play developer account.
3. Google Play App Signing configuration.
4. Protected GitHub `production` environment secrets for the approved upload key, upload-certificate fingerprint, Maps key and Play service account.
5. Publication of the privacy policy at a public HTTPS URL with effective date and monitored privacy contact.
6. Play Console Data Safety review against the real production processor inventory.
7. Dedicated CLIENT/VET reviewer access in Play Console.
8. Signed AAB generated from the immutable promoted RC tag.
9. Actual Internal Testing upload and operator review.
10. Physical-device smoke evidence.

## Legal-entity boundary

Do not replace the privacy-policy controller with a proposed or pending company name before that entity actually exists and is the production operator/controller. The repository source intentionally keeps this field unresolved until the operator can provide real legal evidence.

## Payment-rail independence

Phase 13E may complete while `real-transfer-rail` remains pending. The Android repository can be technically prepared while BOLD/PSE and the final CTG One Technology S.A.S. payment setup are still in progress. RC promotion and commercial release remain fail-closed until all applicable release gates are satisfied.

## Exit criterion

Phase 13E is complete when the preflight workflow is green on `main` and the external handoff remains explicitly pending rather than silently promoted.
