# Nvet Care — Android 16 / API 36 behavior review

**Phase:** 13 — Android Production  
**Scope:** repository-level compatibility review for `targetSdkVersion = 36`  
**Reviewed:** 2026-09-01  
**Application:** `com.nvetcare`

## Purpose

This document is the concrete repository evidence for the Phase 13 gate `android16BehaviorReviewCompleted`.
It records which Android 16 behavior changes are relevant to Nvet Care, how the current 1.0 release candidate handles them, and which items still require external/device evidence.

This review does **not** certify Google Play publication, Play App Signing, a signed AAB, physical-device smoke testing, or provider-level Release Candidate evidence.

Official references:

- https://developer.android.com/about/versions/16/behavior-changes-16
- https://developer.android.com/about/versions/16/behavior-changes-all
- https://developer.android.com/about/versions/16/migration

## Compatibility decisions

| Android 16 area | Nvet exposure | 1.0 decision | Evidence / residual risk |
|---|---|---|---|
| Edge-to-edge enforcement | Applicable. Nvet targets API 36 and cannot opt out on Android 16. | Keep edge-to-edge enabled; do not use `windowOptOutEdgeToEdgeEnforcement`. Root UI uses `SafeAreaProvider`; screen-level safe-area handling remains part of mobile UI tests. | Static contract verifies the forbidden opt-out is absent and `SafeAreaProvider` remains present. Physical visual validation is still required by `physicalDeviceSmokeVerified`. |
| Predictive back | Applicable. React Navigation/React Native currently owns the back stack. API 36 can stop dispatching legacy back callbacks by default. | Explicitly set `android:enableOnBackInvokedCallback="false"` for the 1.0 stabilization window. This preserves deterministic legacy back behavior until the navigation stack is migrated and device-tested for predictive back. | Static contract enforces the explicit decision. Predictive-back UX enablement is a post-stabilization improvement, not falsely claimed as complete. |
| Large-screen orientation/resizability | Applicable on displays with `smallestWidth >= 600dp`. The current app is phone-first and still declares portrait orientation. | Explicitly use `android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY=true` during 1.0 stabilization. This avoids an untested tablet/foldable layout transition while preserving the existing phone UX. | Static contract enforces the compatibility property. A later adaptive-layout phase should remove the opt-out only after tablet/foldable UI certification. |
| Safer intent resolution | Applicable to the exported launcher/deep-link activity. | Keep deep linking constrained to the explicit custom scheme `nvetcare://` with `VIEW`, `DEFAULT`, and `BROWSABLE`; no generic implicit forwarding contract is introduced. | Manifest is reviewed as part of the contract. Any future HTTP/App Link expansion requires a separate verified-domain design. |
| Fixed-rate scheduling optimization | No direct repository-owned `scheduleAtFixedRate` release-critical scheduler is part of the mobile contract. | No code change required. | Reassess if a native background scheduler is introduced. |
| Local network permission | Nvet communicates with remote HTTPS APIs and maps; it has no intended LAN device-discovery feature. | Do not request local-network access for 1.0. | If LAN discovery is added later, permission/data-safety review must be reopened. |
| App-owned photos / photo picker | Potentially applicable because clinical/profile image selection exists through React Native image picker. | Do not add broad storage/media permissions. Continue using system/library picker behavior supplied by the dependency and validate image-selection flows in mobile tests. | Physical/device smoke remains required; this review does not substitute for Data safety or runtime permission evidence. |
| Health and fitness permissions | Not applicable. Nvet veterinary records are not Android Health Connect human-health records. | Do not request Health Connect permissions. | No action required unless product scope changes. |
| MediaStore version lockdown | No release-critical logic relies on a globally comparable `MediaStore.getVersion()`. | No code change required. | Reassess if media synchronization logic is introduced. |
| GPU syscall filtering / ART internals | No repository-owned native code intentionally depends on private ART/GPU ioctl behavior. | No code change required. | Native dependency build remains covered by Android Gradle CI. |

## Manifest hardening applied

The API 36 stabilization boundary is explicit in `mobile/android/app/src/main/AndroidManifest.xml`:

- predictive back is temporarily opted out with `android:enableOnBackInvokedCallback="false"`;
- large-screen restricted-resizability compatibility mode is explicit using `android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY=true`;
- `android:screenOrientation="portrait"` remains a phone-first product decision for 1.0 and is no longer assumed to be authoritative on Android 16 large screens without the compatibility property;
- no edge-to-edge opt-out is present.

## Automated regression contract

`scripts/verify-android16-compatibility.mjs` fails closed if a future change:

1. stops targeting/compiling API 36;
2. introduces the deprecated edge-to-edge opt-out;
3. removes root safe-area provisioning;
4. removes the explicit predictive-back stabilization decision;
5. removes the large-screen compatibility decision while the Phase 13 review still declares the app phone-first;
6. removes the constrained `nvetcare` deep-link contract.

The `Android Production Readiness` pull-request workflow executes this verification alongside the Phase 13 manifest contract.

## What remains external

This review legitimately closes only `android16BehaviorReviewCompleted`.
The following gates remain independent and must stay `pending` until concrete evidence exists:

- `rcPromoted`;
- `playConsoleAppCreated`;
- `playAppSigningEnabled`;
- `uploadCertificatePinned`;
- `privacyPolicyPublished`;
- `dataSafetyReviewed`;
- `signedAabVerified`;
- `internalTrackUploaded`;
- `physicalDeviceSmokeVerified`.

In particular, the static compatibility review is **not** a substitute for testing the final signed candidate on at least two physical Android devices.
