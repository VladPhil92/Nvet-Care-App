# Nvet Care — Google Play reviewer access runbook

**Phase:** 13D  
**Package:** `com.nvetcare`  
**Status:** operational procedure prepared; actual reviewer credentials remain external and must never be committed.

Google Play review may require access to authenticated product areas. Nvet Care has distinct CLIENT and VET experiences, so reviewer access must prove both role boundaries without granting administrative authority.

## Reviewer-account policy

Create dedicated, non-personal production-review accounts only when the release candidate is ready for Play review. The accounts must be scoped to the minimum permissions needed to exercise the reviewed flows.

- One CLIENT reviewer account.
- One VET reviewer account with an approved/verified vet profile if the production UX requires verification before access.
- Never use ADMIN, SUPERADMIN, owner, finance-admin, or internal tester escalation credentials for Play review.
- Never store passwords, OTP seeds, recovery codes, service-account JSON, API keys, keystores, or session tokens in Git, issues, PRs, release notes, screenshots, or this runbook.
- Store the reviewer username/password only in the protected Play Console App access field or another approved secrets channel.

## CLIENT reviewer path

The reviewer instructions should identify the shortest deterministic path to:

1. sign in;
2. open the user dashboard;
3. inspect or create a test pet;
4. discover veterinarians;
5. open the map and grant location only when prompted;
6. create or inspect a controlled test appointment;
7. open appointment chat;
8. inspect appointment tracking where available;
9. inspect the in-app notification inbox;
10. open **Perfil → Privacidad y cuenta → Eliminar cuenta** and verify that the server-side readiness result is visible.

Do not require a real payment to pass basic Play review navigation. If a payment-dependent screen must be reviewed, provide a deterministic sandbox/test route or clear instructions that stop before moving real funds.

The dedicated reviewer account should normally stop before destructive confirmation unless the review procedure explicitly provisions a disposable account for the deletion test. When a destructive test is required, use synthetic data only and verify that the account becomes unauthenticated after deletion.

## VET reviewer path

The reviewer instructions should identify the shortest deterministic path to:

1. sign in as the dedicated VET reviewer;
2. open the veterinarian dashboard;
3. view professional/verification state;
4. inspect assigned test appointments;
5. open pet context only through an authorized appointment;
6. use appointment chat;
7. exercise status/tracking controls on a controlled test appointment;
8. inspect clinical-note entry without exposing real customer records;
9. inspect earnings/payment UI without initiating a real withdrawal;
10. open the account-deletion readiness screen and verify that open financial/appointment obligations block destructive deletion when applicable;
11. log out.

## Test-data boundary

Reviewer accounts must use synthetic pets, synthetic appointments, synthetic chat content, and non-sensitive addresses appropriate for testing. Do not expose real customer records or real veterinary histories merely to satisfy store review.

If Maps/location evidence is required, the reviewer may grant runtime location permission on the review device. The account instructions must not ask the reviewer to enable background location because the Phase 13D Android manifest does not declare it.

## Two-factor authentication

If production policy requires 2FA for a reviewer role, provide a deterministic reviewer-safe procedure in Play Console. Do not disable production 2FA globally for store review. Do not commit an authenticator seed or recovery code.

## Account deletion requirement

Phase 13D implements the in-app self-service flow and backend deletion contract. Reviewer instructions should identify **Perfil → Privacidad y cuenta → Eliminar cuenta** and the public information route `/api/privacy/account-deletion` without embedding any privileged credentials.

The destructive flow requires the exact confirmation phrase `ELIMINAR MI CUENTA`, local-password reauthentication when applicable, and TOTP when 2FA is enabled. The backend blocks deletion while active/disputed appointments, unresolved transactions, wallet balance or open withdrawals remain. Retained clinical, financial, professional-verification or audit records are pseudonymized when retention is required.

The actual production reachability of the public route, provider-side purge/retention review, and Play Console reviewer instructions remain external evidence. Repository implementation alone does not make `playReviewerAccessConfigured` verified.

## Evidence to retain

For the release record, capture only non-secret evidence:

- Play Console application/package identity;
- date reviewer instructions were updated;
- roles provisioned (CLIENT/VET), without credentials;
- commit/tag used for the review build;
- Internal Testing release reference;
- reviewer-access verification result;
- account-deletion path and public-route verification result.

Mark `playReviewerAccess` or related release evidence verified only after the actual Play Console instructions have been populated and tested with the release candidate.
