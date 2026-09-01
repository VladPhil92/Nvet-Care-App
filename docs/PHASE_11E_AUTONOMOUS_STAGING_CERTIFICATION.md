# Phase 11E — Autonomous Staging Certification & RC Promotion Automation

## Objective

Remove static GitHub E2E credential dependencies from the Nvet release-candidate path while keeping staging isolated, production fail-closed and payment evidence boundaries explicit.

The canonical chain is now designed as:

`CI → Staging E2E Seed & Preflight → Nvet Transfer Payment Rail Certification → Web Production Convergence`

## Staging session authority

GitHub Actions uses only the `RAILWAY_API_TOKEN` stored in the protected `staging` environment. The workflow does not require persistent `E2E_CLIENT_*`, `E2E_VET_*`, `E2E_ADMIN_*`, `E2E_API_URL` or direct staging database credentials in GitHub.

`scripts/railway-staging-session.mjs`:

1. verifies the exact Railway project, staging environment and staging backend service IDs and names;
2. explicitly refuses the canonical production backend service ID;
3. generates fresh synthetic CLIENT, VET and ADMIN passwords at runtime;
4. masks those passwords in GitHub Actions;
5. writes the synthetic credentials only to Railway staging service variables;
6. deploys the exact candidate commit SHA to staging;
7. waits for a successful Railway deployment;
8. verifies `/api/health/ready` reports the same candidate revision;
9. exports the rendered staging API URL and rotated credentials only into the current Actions job environment.

If a Railway deployment fails, the session manager publishes a bounded tail of build/deployment logs before failing the gate.

## Rotating fixture idempotency

The E2E seed previously anchored the veterinarian profile by `userId`. Rotating a veterinarian email created a new `User` and then collided with the canonical `NVET-E2E-0001` license.

The seed now treats the professional fixture as canonical by `licenseNumber` and safely re-links it to the current synthetic VET user. Deterministic pet/appointment IDs are explicitly cleared before recreation so CLIENT identity rotation is repeatable as well.

The seed remains fail-closed and can execute only with:

- `NVET_ALLOW_E2E_SEED=true`; and
- `NVET_SEED_TARGET=test|staging`.

Production does not satisfy that contract.

## TRANSFER application certification

The staging payment gate proves:

- CLIENT creates a new staging-only appointment;
- CLIENT initiates `TRANSFER` and receives `PENDING`;
- VET uploads an allowed synthetic PDF proof and advances the transaction to `VERIFYING`;
- ADMIN confirms the transfer and advances it to `CONFIRMED`;
- the appointment becomes `CONFIRMED`;
- the owning CLIENT can read the final transaction/appointment state;
- the synthetic appointment is cancelled after certification to release availability.

The backend upload allow-list is not weakened. The certification harness was corrected to use `application/pdf` instead of an invalid text fixture.

## Evidence boundary

A successful TRANSFER certification proves the Nvet application authorization and state-machine lifecycle. It does **not** prove actual bank funds movement.

Therefore `paymentRailVerified` remains external/pending until a controlled real transfer is executed and retained as operator evidence.

The same separation applies to recovery:

- repository `pg_dump/pg_restore` rehearsal is machine evidence;
- provider-level backup configuration and provider-level restore drill remain external evidence.

## Tested implementation evidence during development

The Phase 11E feature-branch smoke test successfully proved, against the real isolated Railway staging service:

- exact candidate deployment;
- runtime credential rotation;
- staging seed with rotated identities;
- candidate revision equality;
- CLIENT/VET authentication;
- emergency veterinarian discovery;
- CLIENT → VET → ADMIN TRANSFER lifecycle through `PENDING → VERIFYING → CONFIRMED`.

Temporary smoke and one-off diagnostic workflows were removed before promotion; their durable functionality lives in the production staging/session workflows and session manager.

## Exit criteria

Phase 11E is complete when the merged `main` commit demonstrates the automatic chain end-to-end and Web Production Convergence reports all machine-verifiable gates green.

Remaining full RC blockers after that point must be external/operator evidence only:

1. production provider backups configured;
2. non-destructive provider restore drill verified;
3. controlled real bank transfer evidence.
