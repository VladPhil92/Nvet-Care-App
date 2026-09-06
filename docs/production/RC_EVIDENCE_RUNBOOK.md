# Nvet 1.0.0-rc.1 — External Evidence Closure Runbook

This runbook closes the production evidence that cannot be inferred from unit tests, staging fixtures or synthetic incident drills.

## Non-negotiable evidence boundary

Machine evidence and external evidence are deliberately separate.

- A successful `Nvet Recovery Readiness` run proves the repository can perform a logical `pg_dump` / `pg_restore` recovery rehearsal. It does **not** prove Railway production backups are configured or restorable.
- A successful `Nvet Transfer Payment Rail Certification` run proves CLIENT → VET → ADMIN authorization and the Nvet payment state machine in isolated staging. It does **not** prove money moved through a bank.
- Synthetic alert drills can prove the incident path without mutating production, but cannot replace provider or financial evidence.
- A successful `Nvet Production Deployment Attestation` run proves Railway's latest active successful production deployment metadata identifies the same commit revision currently served by the public backend. It does **not** imply that an unrelated current `main` commit had to trigger a new backend deployment when watched-file rules legitimately skipped it.

Do not set an RC external evidence gate to `verified` from a staging, synthetic or repository-only proof.

## Machine control — Railway production deployment attestation

Workflow: `Nvet Production Deployment Attestation`

This is a read-only machine control, not one of the external-evidence gates. It protects against a subtle but important failure mode: a healthy public endpoint serving a different revision from the deployment Railway declares active.

The workflow:

1. validates the canonical Railway project, production environment and backend service IDs/names;
2. queries Railway's official deployment list with `successfulOnly: true` and selects the latest active successful production deployment;
3. requires that deployment to be `SUCCESS` and extracts the provider commit hash from deployment metadata;
4. probes `/api/health/ready` and requires application + PostgreSQL readiness;
5. requires the public `revision` to equal the first 12 characters of the provider deployment commit SHA;
6. uploads a redacted `railway-production-deployment-attestation` artifact.

A candidate SHA differing from the provider deployment SHA is informational rather than automatically fatal because Railway can correctly skip backend deployment when a commit changes only unwatched files. The fail-closed invariant is **provider latest active successful deployment SHA == live public readiness revision**.

`Web Production Convergence` executes the same attestation before accepting production backend readiness, so a stale or misrouted runtime cannot pass merely because `/api/health/ready` returns HTTP 200.

## Gate 1 — Railway production backups configured

### Automated evidence

Workflow: `Nvet Production Backup Evidence`

The workflow performs a read-only Railway GraphQL audit against the canonical Nvet project and production environment. It discovers the production PostgreSQL volume instance and verifies that at least one automatic volume-backup schedule exists. It does not create or mutate backups.

Acceptance criteria:

1. The workflow completes successfully on `main`.
2. Exactly one production PostgreSQL volume instance is discovered.
3. `scheduleCount >= 1`.
4. At least one visible provider backup exists and satisfies the freshness policy.
5. At least one configured schedule satisfies the minimum retention policy.
6. The uploaded `railway-production-backup-evidence` artifact identifies the provider observation time, project/environment, PostgreSQL service, volume instance and backup/schedule metadata.
7. No credentials, database URLs or user data are present in the artifact.

If the workflow reports zero schedules, enable at least a Daily schedule in Railway's PostgreSQL service → **Backups**. Weekly and Monthly schedules are recommended in addition to Daily for production defense in depth.

Railway may restrict native volume Backups/PITR to specific paid workspace plans. When the dashboard explicitly reports that the current plan does not expose Backups/PITR, treat that as a **provider capability/configuration blocker**, not as a PostgreSQL runtime incident. Do not weaken the RC gate to compensate: activate the required provider capability, configure the schedules, wait until a real backup becomes visible, and rerun the read-only audit.

The audit uses the shared Railway GraphQL retry transport so transient provider/API failures are retried; a stable zero-schedule/zero-backup result remains fail-closed and is not converted into a warning.

Only after a successful provider audit may `productionBackupConfigured` be changed from `pending` to `verified`, with the successful Actions run URL retained as evidence.

## Gate 2 — Provider-level restore drill

This gate intentionally requires an operator-controlled change. Do not automate a Railway restore from an unattended GitHub Actions workflow. Use `docs/production/RAILWAY_RESTORE_DRILL.md` as the canonical operator checklist and redacted evidence template.

Railway volume restore changes the mounted volume and is therefore an operational action, even though Railway stages the change for review before deployment. Treat the exercise as a maintenance procedure.

Acceptance criteria:

1. A recent production volume backup exists and its timestamp is recorded.
2. The current production database health/readiness is recorded before the drill.
3. A Railway restore is initiated only during an approved maintenance window with an explicit rollback owner.
4. The restored volume is validated for expected PostgreSQL structure/data before declaring the drill successful.
5. The service is returned to the intended canonical volume and `/api/health/ready` is healthy after the exercise.
6. The production deployment attestation is rerun after the drill so provider metadata and the live backend revision reconverge.
7. A dated, redacted operator record is retained outside the repository; it must identify the backup timestamp, restore timestamp, result and rollback outcome without exposing secrets or customer data.
8. The evidence reference is then recorded in `restoreDrillVerified` and the status changed to `verified`.

The existing application-level `pg_dump` / `pg_restore` rehearsal remains useful defense in depth and should continue running independently.

## Gate 3 — Real TRANSFER rail evidence

Use a controlled, minimal-value transaction owned by the test operator. Do not use a customer's funds or production veterinary activity as test material.

Acceptance criteria:

1. CLIENT creates a controlled test appointment/payment using the real TRANSFER path.
2. The transfer is performed through the intended banking rail with a minimal test amount.
3. A real bank/reference identifier is received and retained privately.
4. Nvet payment proof is submitted through the intended application flow.
5. The authorized VET/ADMIN lifecycle reaches the expected final state and the appointment/payment remains readable by the owning CLIENT.
6. The banking side independently confirms the funds movement; an application state alone is insufficient.
7. The retained evidence is redacted: no account numbers, credentials, identity documents or full banking receipts are committed to Git.
8. The evidence reference and observation date are recorded in `paymentRailVerified`, then the status is changed to `verified`.

If the production integration is still sandbox/mock or the banking rail does not actually move funds, the gate remains `pending`.

## Promotion rule

`1.0.0-rc.1` may be promoted only when:

- all machine gates required by `scripts/verify-release-candidate-readiness.mjs --runtime` are green and fresh;
- production deployment attestation is healthy and provider/live revision identity is intact; and
- every entry under `requiredExternalEvidence` in `docs/production/RC_READINESS.json` is `verified` with an auditable evidence reference.

The promotion must remain fail-closed. Missing evidence is a release blocker, not a warning.
