# Nvet Care — Google Play Data Safety source matrix

**Phase:** 13C  
**Package:** `com.nvetcare`  
**Status:** repository inventory prepared; Play Console declaration remains external evidence and is intentionally `pending`.

This document is the canonical engineering input for the Google Play **Data safety** form. It is not itself proof that the Play Console form has been submitted or approved. The operator must reconcile this matrix with the exact Google Play taxonomy and the production provider configuration before changing `dataSafetyReviewed` to `verified`.

## Collection boundary

The Android client currently declares only `INTERNET`, `ACCESS_COARSE_LOCATION`, and `ACCESS_FINE_LOCATION`. It does not declare background location, camera, microphone, contacts, broad-storage, or Android notification runtime permissions in the app manifest. Location is requested in-app for nearby veterinarian discovery and active-appointment tracking.

The mobile package includes geolocation, maps, user-selected media, local session storage, HTTP transport, and realtime socket transport. No dedicated advertising SDK or mobile analytics SDK is present in the Phase 13C dependency inventory.

## Engineering inventory for the Play form

| Engineering data group | Examples observed in the app contract | Primary purpose | User-controlled / optional | Play Console review |
|---|---|---|---|---|
| Personal information | email, first/last name, phone, avatar, role | account creation, authentication, service delivery | account data required in part; phone/avatar may be optional | Map to exact Play personal-info categories |
| Security/session data | access/refresh session, 2FA state, device label, session metadata | account security, fraud prevention | generated as part of authentication | Confirm whether any item maps to Device or other IDs / App activity |
| Veterinarian professional data | license number, specialties, verification status, rating | professional verification and marketplace trust | required for veterinarian role as applicable | Review classification as Other info / account information |
| Pet and veterinary data | pet identity, species, breed, weight, birth date, photo, notes | veterinary service and continuity of care | user-provided | Pet clinical information does not map one-to-one to human Health data; classify against current Play taxonomy before submission |
| Appointment and clinical content | date/time, service address, notes, diagnosis, treatment, clinical notes | booking and veterinary care | generated/provided during service | Review User-generated content / Other info mapping |
| Precise/coarse location | latitude, longitude, accuracy, heading, speed | nearby vets and active appointment tracking | runtime permission; feature degrades when denied | Declare Location collection consistent with actual production behavior |
| Messages | appointment chat, shared price information, report details | client-vet communication, safety and dispute handling | user-generated | Review Messages category and retention/processing statements |
| Financial/transaction data | method, amount, status, transfer proof, withdrawal account details, document ID | payment, transfer validation, withdrawals | required only when using corresponding payment flow | Declare applicable Financial info categories; never claim payment credentials are absent without provider review |
| User-selected files/media | transfer proof and other explicitly selected files/images | transfer verification or profile/service workflows | user initiated | Review Photos and videos / Files and docs categories according to final picker flows |
| AI prompts/context | user question, pet ID, appointment ID, veterinary case context | care guidance, pre-visit support, vet case support/documentation | feature initiated by user | Provider-processing and retention review required before Play submission |
| Notification inbox activity | type, message, action path, read status | service updates and reminders | generated from account activity | Current mobile implementation is an in-app inbox; no push-notification runtime permission is declared |

## Sharing versus service-provider processing

The repository proves that the Android app transmits service data to the Nvet backend. Some backend capabilities may then use infrastructure, AI, payment, email, storage, mapping, monitoring, or other processors. Google Play's definition of **sharing** has specific exceptions for service providers and legal purposes; therefore this repository does not hard-code a blanket `shared=true` or `shared=false` answer.

Before submitting the Data safety form, the operator must review the production configuration and contracts for every active processor and record whether each transfer is treated as collection, service-provider processing, or sharing under the then-current Play definition.

## Security statements that may be used only after verification

The release form must not claim a property merely because code intends it. The following claims require production evidence before they are selected in Play Console:

- data encrypted in transit end-to-end across every production endpoint;
- account deletion available to all account-creating users;
- deletion request URL publicly accessible;
- data not shared with third parties;
- no provider retention of AI input/output;
- payment information handled exclusively by a processor;
- independent security review or certification.

## Account deletion blocker

The Phase 13C audit does not find a verified self-service account deletion endpoint plus matching mobile flow. Because Nvet Care allows users to create accounts, this remains a **public-production blocker** and is recorded as `accountDeletion.status = pending` in `ANDROID_PLAY_COMPLIANCE.json`.

Do not represent account deletion as available in Play Console until the backend behavior, mobile UX, retention exceptions, and public deletion-request route have been implemented and tested.

## Evidence required to mark `dataSafetyReviewed` verified

The repository gate may move from `pending` to `verified` only after there is dated evidence that:

1. the Play Console Data safety form was reviewed against the commit/tag being released;
2. all active production processors were reconciled;
3. permission declarations match the signed bundle;
4. account deletion requirements are satisfied or an applicable documented exception exists;
5. the public privacy policy uses the same data categories/purposes;
6. a reviewer recorded the Play Console evidence reference in `ANDROID_PRODUCTION_READINESS.json`.
