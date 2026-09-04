# Phase 12I — Production Evidence Execution & RC Promotion

Phase 12I converts the remaining Release Candidate blockers into an ordered production-evidence execution path. It does not treat CI success as provider, legal, operational or financial evidence.

## Verified starting point

The latest retained Railway production-backup audit available when this phase was authored is workflow run `33851146392`, artifact `9928378148`, SHA-256 `f25d9406555ffc968376449cddbcc3c21e1f37e425f6f8c3e3d08e433ffa711f`.

That run successfully authenticated to Railway and located the canonical production PostgreSQL volume `postgres-volume` (`e9befa8c-34d3-4e06-90dc-ae65e71a38d9`). It then reported:

- automatic backup schedules: `0`;
- visible backups: `0`;
- latest backup age: unavailable;
- retention >= 168 hours: false.

Therefore `productionBackupConfigured`, `restoreDrillVerified`, `paymentRailVerified` and RC promotion remain fail-closed.

## Execution order

1. **Configure Railway production backups.** The production PostgreSQL volume must have at least one automatic schedule. The repository policy requires a visible backup no older than 48 hours and retention of at least 168 hours.
2. **Re-run the provider audit.** `Nvet Production Backup Evidence` must succeed and upload a redacted evidence artifact.
3. **Execute the provider restore drill.** Select a recent real provider backup, define a maintenance window and rollback owner, perform the controlled restore procedure, validate database structure and `/api/health/ready`, then retain a redacted evidence reference.
4. **Execute a real TRANSFER test.** Use an operator-owned controlled appointment and minimal-value real transfer. Confirm independent bank-side funds movement and complete the intended Nvet verification lifecycle. Keep only a redacted reference in repository evidence.
5. **Promote `1.0.0-rc.1`.** Promotion is allowed only after all RC external evidence gates are verified and the Phase 12H/12I boundaries remain green.

## Automation boundary

`phase-12i-production-evidence-gate.mjs` verifies that provider observations and readiness manifests cannot contradict each other. A green Phase 12I workflow means the repository is representing the real evidence state consistently; it does **not** mean the RC is approved.

The canonical backup auditor remains read-only. Provider configuration must be changed in Railway or through an authorized Railway integration. The manifest must never be marked verified before a fresh provider audit proves the required schedule, freshness and retention.

## Exit criteria

Phase 12I exits only when:

- `productionBackupConfigured = verified`;
- `restoreDrillVerified = verified`;
- `paymentRailVerified = verified`;
- Release Candidate readiness is green and fresh;
- immutable tag `1.0.0-rc.1` is created from the certified candidate;
- `rcPromoted` is recorded as verified for the Cartagena beta program.
