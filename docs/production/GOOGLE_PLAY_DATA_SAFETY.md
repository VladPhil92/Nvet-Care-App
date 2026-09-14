# Nvet Care — Google Play Data Safety source matrix

**Phase:** 13D / Phase 35 convergence / Phase 36 observability  
**Package:** `com.nvetcare`  
**Status:** repository inventory prepared; Play Console declaration remains external evidence and is intentionally `pending`.

This document is the canonical engineering input for the Google Play **Data safety** form. It is not itself proof that the Play Console form has been submitted or approved. The operator must reconcile this matrix with the exact Google Play taxonomy and the production provider configuration before changing `dataSafetyReviewed` to `verified`.

## Collection boundary

The Android client currently declares only `INTERNET`, `ACCESS_COARSE_LOCATION`, and `ACCESS_FINE_LOCATION`. It does not declare background location, camera, microphone, contacts, broad-storage, or Android notification runtime permissions in the app manifest. Location is requested in-app for nearby veterinarian discovery and active-appointment tracking.

The mobile package includes geolocation, maps, user-selected media, local session storage, HTTP transport, realtime socket transport, CTG One identity federation, and first-party runtime diagnostics sent to the Nvet backend. No dedicated advertising SDK or third-party mobile analytics SDK is present in the repository dependency inventory.

Phase 35 additionally enforces an HTTPS-only default Android network policy for production/release resources. Emulator-only cleartext access to `10.0.2.2` and `localhost` is isolated under `src/debug` and is therefore excluded from the release bundle.

## Engineering inventory for the Play form

| Engineering data group | Examples observed in the app contract | Primary purpose | User-controlled / optional | Play Console review |
|---|---|---|---|---|
| Personal information | email, first/last name, phone, avatar, role | account creation, authentication, service delivery | account data required in part; phone/avatar may be optional | Map to exact Play personal-info categories |
| Security/session data | access/refresh session, 2FA state, device label, session metadata | account security, fraud prevention | generated as part of authentication | Confirm whether any item maps to Device or other IDs / App activity |
| Federated authentication | CTG One authorization code, PKCE verifier, OAuth-style state, optional 2FA code, identity linkage | authentication, account linking, fraud/account security | user chooses “Continue with CTG One”; 2FA only when required | Reconcile with Play account-management/security categories and CTG One production processing |
| Runtime diagnostics/app activity | allow-listed event name, operation duration, normalized outcome code, app/version code | app functionality, diagnostics, performance and release safety | generated while the app is used; client queue is memory-only | Reconcile with Play App activity / App info and performance / Diagnostics taxonomy before submission |
| Veterinarian professional data | license number, specialties, verification status, rating | professional verification and marketplace trust | required for veterinarian role as applicable | Review classification as Other info / account information |
| Pet and veterinary data | pet identity, species, breed, weight, birth date, photo, notes | veterinary service and continuity of care | user-provided | Pet clinical information does not map one-to-one to human Health data; classify against current Play taxonomy before submission |
| Appointment and clinical content | date/time, service address, notes, diagnosis, treatment, clinical notes | booking and veterinary care | generated/provided during service | Review User-generated content / Other info mapping |
| Precise/coarse location | latitude, longitude, accuracy, heading, speed | nearby vets and active appointment tracking | runtime permission; feature degrades when denied | Declare Location collection consistent with actual production behavior |
| Messages | appointment chat, shared price information, report details | client-vet communication, safety and dispute handling | user-generated | Review Messages category and retention/processing statements |
| Financial/transaction data | method, amount, status, transfer proof, withdrawal account details, document ID | payment, transfer validation, withdrawals | required only when using corresponding payment flow | Declare applicable Financial info categories; never claim payment credentials are absent without provider review |
| User-selected files/media | transfer proof and other explicitly selected files/images | transfer verification or profile/service workflows | user initiated | Review Photos and videos / Files and docs categories according to final picker flows |
| AI prompts/context | user question, pet ID, appointment ID, veterinary case context | care guidance, pre-visit support, vet case support/documentation | feature initiated by user | Provider-processing and retention review required before Play submission |
| Notification inbox activity | type, message, action path, read status | service updates and reminders | generated from account activity | Current mobile implementation is an in-app inbox; no push-notification runtime permission is declared |

## Phase 36 first-party runtime diagnostics boundary

The Android client records only an allow-listed set of coarse runtime events needed to evaluate release health, including app start, login/refresh outcomes, CTG One federation stages, and API success/failure. Event payloads may include an operation duration and a normalized machine-readable outcome code. The client telemetry queue is bounded and memory-only; it is not persisted to AsyncStorage.

The telemetry contract explicitly forbids user identifiers, emails, bearer/refresh tokens, passwords, 2FA codes, authorization codes, PKCE state/verifier values, clinical free text, payment credentials, request/response bodies, endpoint URLs and raw client stack traces. The backend aggregates recent events in a bounded per-instance buffer and emits the same sanitized fields to structured provider logs. Automated telemetry cannot approve beta evidence or authorize a public rollout.

`playRuntimeDiagnosticsDeclarationReview` therefore remains `pending` until the Play Console Data safety form is reconciled with the exact taxonomy applicable to first-party diagnostics and app activity for the signed release candidate.

## CTG One identity federation boundary

The Android client implements CTG One sign-in as an authorization-code flow with PKCE S256 and state validation. The browser redirect contains a short-lived authorization code and state; it does **not** contain Nvet access/refresh tokens or a CTG One bearer token. The PKCE verifier remains device-side until it is sent over HTTPS to the CTG One token endpoint. If the existing Nvet account requires 2FA, the user-provided authenticator code is included only in that HTTPS exchange.

The resulting authenticated Nvet session is persisted through the same secure-storage/session path used by ordinary Nvet login. Nvet remains the role and authorization authority, including preservation of ADMIN/SUPERADMIN/VET/CLIENT role state. This repository evidence describes the technical boundary; it does not by itself determine whether CTG One processing is “sharing” under the current Google Play definition. `ctgOneFederationDataHandlingReview` therefore remains external evidence and `pending` until the production identity-processing relationship and Play Console declaration are reconciled.

## Sharing versus service-provider processing

The repository proves that the Android app transmits service data and first-party runtime diagnostics to the Nvet backend and, when the user explicitly chooses federated sign-in, exchanges authentication data with CTG One. Some backend capabilities may then use infrastructure, AI, payment, email, storage, mapping, monitoring, identity, or other processors. Google Play's definition of **sharing** has specific exceptions for service providers and legal purposes; therefore this repository does not hard-code a blanket `shared=true` or `shared=false` answer.

Before submitting the Data safety form, the operator must review the production configuration and contracts for every active processor and record whether each transfer is treated as collection, service-provider processing, or sharing under the then-current Play definition.

## Account deletion lifecycle

Phase 13D implements the repository-side account deletion chain:

- authenticated readiness check before deletion;
- self-service mobile flow under **Profile → Privacy and account → Delete account**;
- exact destructive confirmation phrase `ELIMINAR MI CUENTA`;
- current-password reauthentication for local-password accounts and TOTP confirmation whenever 2FA is enabled;
- fail-closed blockers for active/disputed appointments, unresolved transactions, non-zero wallet balance, open veterinarian withdrawals and administrative accounts;
- `DELETE /api/auth/account` as the destructive backend operation;
- `/api/privacy/account-deletion` as the public deletion-information route contract;
- revocation/removal of sessions and removal of operational account identifiers;
- deletion of non-historical pet records and pseudonimización of records that must remain linked to historical veterinary care;
- retention, under a pseudonymous inactive account anchor, of clinical, financial, professional-verification and audit records only when continuity, security or legal obligations require it.

The repository implementation does **not** prove that every external processor has independently purged a previously uploaded object. For example, an application record may hold a provider URL while the provider has its own lifecycle. `accountDeletionProviderPurgeReview` therefore remains external evidence and `pending` until production storage/provider behavior is verified.

Likewise, the public deletion route must be checked on the deployed production backend before `accountDeletionProductionRoute` is promoted from `pending` to `verified`.

## Security statements and evidence boundaries

Repository code now supports self-service account deletion, release-network hardening and privacy-minimized first-party diagnostics, but Play Console declarations must still match deployed behavior. The following claims remain external until verified for the release candidate:

- data encrypted in transit across every production endpoint and processor hop;
- deletion request URL publicly reachable in production;
- provider-side deletion/retention behavior for storage, payments, AI, identity federation and other processors;
- data not shared with third parties;
- no provider retention of AI input/output;
- payment information handled exclusively by a processor;
- CTG One identity-federation processing classification under the then-current Play definition;
- exact Play classification of Phase 36 first-party runtime diagnostics/app activity;
- independent security review or certification.

## Evidence required to mark `dataSafetyReviewed` verified

The repository gate may move from `pending` to `verified` only after there is dated evidence that:

1. the Play Console Data safety form was reviewed against the commit/tag being released;
2. all active production processors, including CTG One identity federation, were reconciled;
3. permission declarations match the signed bundle;
4. the signed release bundle preserves the HTTPS-only production network policy and R8/minification boundary;
5. Phase 36 runtime diagnostics are declared consistently with actual production collection and current Play taxonomy;
6. the deployed account-deletion endpoint and public route were exercised without bypassing financial/clinical blockers;
7. the public privacy policy uses the same data categories, retention exceptions and purposes;
8. a reviewer recorded the Play Console evidence reference in `ANDROID_PRODUCTION_READINESS.json`.
