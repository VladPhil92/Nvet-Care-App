# Nvet 1.0.0-rc.1 — External Evidence Closure Runbook

This runbook closes the production evidence that cannot be inferred from unit tests, staging fixtures or synthetic incident drills.

## Non-negotiable evidence boundary

Machine evidence and external evidence are deliberately separate.

- A successful `Nvet Recovery Readiness` run proves the repository can perform a logical `pg_dump` / `pg_restore` recovery rehearsal. It does **not** prove Railway production backups are configured or restorable.
- A successful `Nvet Transfer Payment Rail Certification` run proves CLIENT → VET → ADMIN authorization and the Nvet payment state machine in isolated staging. It does **not** prove money moved through a bank.
- Synthetic alert drills can prove the incident path without mutating production, but cannot replace provider or financial evidence.

Do not set an RC external evidence gate to `verified` from a staging, synthetic or repository-only proof.

## Gate 1 — Railway production backups configured

### Automated evidence

Workflow: `Nvet Production Backup Evidence`

The workflow performs a read-only Railway GraphQL audit against the canonical Nvet project and production environment. It discovers the production PostgreSQL volume instance and verifies that at least one automatic volume-backup schedule exists. It does not create or mutate backups.

Acceptance criteria:

1. The workflow completes successfully on `main`.
2. Exactly one production PostgreSQL volume instance is discovered.
3. `scheduleCount >= 1`.
4. The uploaded `railway-production-backup-evidence` artifact identifies the provider observation time, project/environment, PostgreSQL service, volume instance and schedule count.
5. No credentials, database URLs or user data are present in the artifact.

If the workflow reports zero schedules, enable at least a Daily schedule in Railway's PostgreSQL service → **Backups**. Weekly and Monthly schedules are recommended in addition to Daily for production defense in depth.

Only after a successful provider audit may `productionBackupConfigured` be changed from `pending` to `verified`, with the successful Actions run URL retained as evidence.

## Gate 2 — Provider-level restore drill

This gate intentionally requires an operator-controlled change. Do not automate a Railway restore from an unattended GitHub Actions workflow.

Railway volume restore changes the mounted volume and is therefore an operational action, even though Railway stages the change for review before deployment. Treat the exercise as a maintenance procedure.

Acceptance criteria:

1. A recent production volume backup exists and its timestamp is recorded.
2. The current production database health/readiness is recorded before the drill.
3. A Railway restore is initiated only during an approved maintenance window with an explicit rollback owner.
4. The restored volume is validated for expected PostgreSQL structure/data before declaring the drill successful.
5. The service is returned to the intended canonical volume and `/api/health/ready` is healthy after the exercise.
6. A dated, redacted operator record is retained outside the repository; it must identify the backup timestamp, restore timestamp, result and rollback outcome without exposing secrets or customer data.
7. The evidence reference is then recorded in `restoreDrillVerified` and the status changed to `verified`.

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

- all machine gates required by `scripts/verify-release-candidate-readiness.mjs --runtime` are green and fresh; and
- every entry under `requiredExternalEvidence` in `docs/production/RC_READINESS.json` is `verified` with an auditable evidence reference.

The promotion must remain fail-closed. Missing evidence is a release blocker, not a warning.
