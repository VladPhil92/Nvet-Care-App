# Phase 11D — Controlled Payment Rail Certification & Provider Evidence Contract

## Objective

Move Nvet Care from payment-safety guards to a repeatable Release Candidate certification path without confusing an application-level payment lifecycle with proof that real money moved.

`TRANSFER` is the first MVP payment rail candidate. `CTG` remains unavailable until the canonical client wallet ledger can debit balances safely. `PSE` remains fail-closed in production while its adapter is sandbox/mock.

## Two independent payment gates

### 1. Machine gate — TRANSFER application lifecycle

Workflow: `Nvet Transfer Payment Rail Certification`

Target: isolated staging only.

Required identities:

- CLIENT — initiates the payment;
- VET — uploads the transfer proof;
- ADMIN — confirms the received transfer.

Required lifecycle:

1. create a dedicated staging appointment using `TRANSFER`;
2. CLIENT calls `/payments/process` and receives a `PENDING` transaction;
3. VET uploads a synthetic proof and the transaction becomes `VERIFYING`;
4. ADMIN confirms the transfer and the transaction becomes `CONFIRMED`;
5. the appointment becomes `CONFIRMED`;
6. CLIENT can read the confirmed transaction and appointment;
7. the synthetic appointment is cancelled after certification so its slot is released.

The harness refuses known production hosts and requires `NVET_PAYMENT_CERTIFICATION_TARGET=staging`.

A successful certification remains fresh for 72 hours under `paymentRailApplicationMaxAgeHours`.

### 2. Operator gate — real funds movement

RC evidence key: `paymentRailVerified`.

This remains `pending` after a successful automated certification. It may only become `verified` after a controlled real bank transfer is executed and dated evidence is retained showing that actual funds moved and that the Nvet transaction/appointment state matched the real-world transfer.

The minimum evidence packet should identify:

- transfer date/time;
- amount;
- originating and receiving rails/accounts in redacted form;
- Nvet appointment ID;
- Nvet transaction ID;
- final Nvet transaction state;
- final appointment state;
- operator who verified receipt;
- evidence reference or immutable run/document reference.

Never commit bank credentials, full account numbers, unredacted receipts, passwords or access tokens to the repository.

## Staging fixture boundary

`backend/prisma/seed.ts` now supports an optional dedicated staging/test ADMIN identity through:

- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`

The pair must be configured together and must be different from CLIENT and VET identities.

The E2E seed remains fail-closed: it only runs when `NVET_ALLOW_E2E_SEED=true` and `NVET_SEED_TARGET` is exactly `test` or `staging`. Production cannot satisfy the intended staging certification contract.

The recovery rehearsal also exercises this ADMIN fixture path with an ephemeral password and verifies it survives logical backup/restore.

## Current staging activation requirement

Railway production and staging services can deploy independently of GitHub E2E evidence. For CI certification, the GitHub `staging` Environment must contain fresh secret-backed fixture configuration.

Base convergence secrets:

- `E2E_API_URL`
- `E2E_CLIENT_EMAIL`
- `E2E_CLIENT_PASSWORD`
- `E2E_VET_EMAIL`
- `E2E_VET_PASSWORD`

Payment certification additionally requires:

- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`

The manual `Staging E2E Seed & Preflight` workflow also currently requires:

- `STAGING_DATABASE_URL`
- `GOOGLE_MAPS_ANDROID_API_KEY`

Once these are installed, run `Staging E2E Seed & Preflight`. A successful run automatically triggers `Nvet Transfer Payment Rail Certification` on `main`.

## Provider backup / restore boundary

`Nvet Recovery Readiness` proves application-level logical recovery using an independent `pg_dump` → empty database → `pg_restore` rehearsal. It does not prove Railway provider-level backup configuration or a Railway provider restore drill.

Therefore these external RC evidence keys remain independent:

- `productionBackupConfigured`
- `restoreDrillVerified`

Do not mark either verified from repository CI evidence alone.

## Exit criteria

Phase 11D code-side implementation is complete when:

- CI, RC contract, Railway contract and recovery rehearsal are green;
- `Nvet Transfer Payment Rail Certification` exists and is production-host fail-closed;
- RC runtime auditing requires fresh TRANSFER application certification;
- `paymentRailVerified` remains external/pending until real funds evidence exists;
- staging/client/vet/admin fixture credentials remain secret-backed and absent from git.

Operational RC closure then requires:

1. GitHub staging secrets installed and staging E2E green;
2. TRANSFER application certification green;
3. one controlled real transfer evidence packet;
4. Railway production backup configuration evidence;
5. non-destructive Railway provider restore evidence.
