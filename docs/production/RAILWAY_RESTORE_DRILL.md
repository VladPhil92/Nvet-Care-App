# Nvet Railway PostgreSQL Restore Drill

This procedure is the operator-controlled companion to the automated `Nvet Recovery Readiness` logical recovery rehearsal. It exists to prove that Railway's **provider-level** production backup can be restored safely and that Nvet can return to its canonical healthy state.

## Safety boundary

- Never trigger this procedure from an unattended GitHub Actions workflow.
- Never delete, wipe or replace the canonical production volume as an exploratory action.
- Execute only after Railway native backups are enabled and at least one recent provider backup is visible.
- Use an approved maintenance window and identify one rollback owner before any provider mutation.
- Do not commit database URLs, credentials, account numbers, customer/patient data, screenshots containing secrets, or full provider receipts to Git.
- Keep the external evidence record redacted; only the final evidence reference/date belongs in `docs/production/RC_READINESS.json`.

## Preconditions

The drill is **blocked** unless all of the following are true:

- [ ] Railway production `backend` is Online.
- [ ] Railway production `Postgres` is Online.
- [ ] Railway production `Redis` is Online.
- [ ] `Nvet Production Deployment Attestation` is green.
- [ ] `Nvet Production Backup Evidence` is green.
- [ ] A recent production PostgreSQL provider backup is visible.
- [ ] The selected backup timestamp and provider backup ID/name are recorded privately.
- [ ] `/api/health/ready` is HTTP 200, `status=ok`, database `up` before the drill.
- [ ] A maintenance window and rollback owner are explicitly approved.

If any precondition is false, stop. Do not use a restore drill as a way to diagnose an already-degraded production system.

## Evidence baseline

Record privately before the provider mutation:

- observation timestamp (UTC);
- Railway project/environment/service names;
- selected backup timestamp and provider backup reference;
- production backend deployment ID and 12-character live revision;
- readiness status and PostgreSQL status;
- application version;
- rollback owner and maintenance window reference.

Do not include secrets or user data.

## Provider restore procedure

1. Open Railway → `Nvet Care App` → `production` → `Postgres` → `Backups`.
2. Confirm the selected backup is recent and is the same backup recorded in the baseline.
3. Initiate the provider restore only through Railway's supported restore flow.
4. Review every staged/provider change before applying it. If Railway presents a destructive replacement rather than an isolated/staged recovery path, stop and reassess before applying.
5. Wait for the provider restore operation to complete. Do not simultaneously deploy unrelated application changes.
6. Validate PostgreSQL availability and then Nvet public readiness.
7. Re-run `Nvet Production Deployment Attestation` so Railway provider deployment metadata and the public live revision are proven to reconverge.
8. Validate the smallest non-sensitive application integrity set available to the operator (schema/migration state and controlled test entities). Do not use customer veterinary records as test fixtures.
9. If validation fails, execute the pre-approved rollback procedure and record the outcome.
10. If validation succeeds, record the final readiness state and close the maintenance window.

## Post-restore acceptance criteria

All items are mandatory:

- [ ] Railway PostgreSQL is healthy after the restore.
- [ ] `/api/health/ready` returns HTTP 200.
- [ ] readiness `status` is `ok`.
- [ ] readiness database check is `up`.
- [ ] `Nvet Production Deployment Attestation` is green after the restore.
- [ ] Prisma migration history is present and consistent.
- [ ] the immutable Nvet manual migration ledger is present and consistent.
- [ ] controlled integrity checks pass.
- [ ] no unexpected production data mutation is observed.
- [ ] rollback outcome is recorded, even when rollback was not required.

## Redacted evidence record template

Store the full operational record in the approved private evidence location. A safe redacted record can use this shape:

```text
Nvet provider restore drill
Date (UTC):
Operator:
Rollback owner:
Maintenance window reference:
Railway project/environment: Nvet Care App / production
Postgres service: Postgres
Backup timestamp:
Backup reference (non-secret):
Pre-drill backend deployment ID:
Pre-drill live revision:
Pre-drill readiness: PASS/BLOCKED
Restore started (UTC):
Restore completed (UTC):
Post-restore readiness: PASS/BLOCKED
Post-restore deployment attestation: PASS/BLOCKED
Migration integrity: PASS/BLOCKED
Controlled data integrity: PASS/BLOCKED
Rollback required: YES/NO
Rollback result: PASS/BLOCKED/N/A
Final verdict: VERIFIED/BLOCKED
Private evidence reference:
```

## RC closure

Only after the complete drill passes:

1. retain the dated redacted evidence in the approved private evidence location;
2. update `restoreDrillVerified.evidence` in `docs/production/RC_READINESS.json` with a non-secret evidence reference;
3. change `restoreDrillVerified.status` from `pending` to `verified`;
4. run the RC readiness/convergence gates again.

A successful repository `pg_dump`/`pg_restore` rehearsal is defense in depth, but it does not replace this provider-level drill.
