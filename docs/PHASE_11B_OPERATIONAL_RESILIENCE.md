# Phase 11B — Operational Resilience & RC Evidence

**Status:** implemented in code; operator/provider evidence remains fail-closed.

## Objective

Close the gap between a technically healthy web deployment and an operationally defensible Release Candidate. Phase 11B focuses on three failure domains that must be explicit before beta activation:

1. database recovery;
2. production incident escalation;
3. payment-rail safety.

This phase deliberately does not mark provider evidence as verified just because supporting code exists.

## 1. Recovery readiness

`.github/workflows/recovery-readiness.yml` runs a reproducible logical recovery rehearsal against PostgreSQL 16.

The workflow:

- materializes the canonical Prisma schema in an isolated source database;
- seeds deterministic synthetic Nvet fixtures using runtime-generated passwords;
- records source counts for users, pets and appointments;
- creates a custom-format `pg_dump` archive without owner/ACL coupling;
- creates a second empty database;
- restores the archive with `pg_restore --exit-on-error`;
- verifies row counts and deterministic pet/appointment fixture IDs;
- executes Prisma against the restored database;
- publishes the dump SHA-256 in the workflow summary.

The drill runs on recovery-contract changes, daily, and on manual dispatch.

### Scope boundary

A green `Nvet Recovery Readiness` run proves the application-level logical backup/restore procedure and schema portability. It does **not** prove that Railway production backups are enabled, nor does it substitute a provider-level restore drill. Those remain external RC evidence.

## 2. Production incident escalation

`Nvet Production Backend Health Canary` continues to probe the canonical Railway readiness endpoint every 15 minutes, but now has an operational escalation lifecycle:

- after the readiness contract fails its retry budget, the workflow opens an issue named `[ALERT] Nvet production backend readiness degraded`;
- repeated failures append evidence to the same open incident instead of creating issue spam;
- the issue records the workflow run and an immediate diagnostic checklist;
- the next healthy canary adds recovery evidence and closes the incident automatically.

The workflow also exposes a non-mutating `simulate_failure` manual input. The synthetic drill targets a local unreachable address; it never changes Railway, PostgreSQL, CTG One or user data. A completed synthetic drill is the preferred evidence before changing `productionAlertingVerified` from `pending` to `verified`.

## 3. Payment rail safety

The current PSE implementation in `PaymentsService` is still a sandbox/mock redirect flow. Phase 11B therefore enforces the following production invariant in `PaymentsController`:

- `PaymentMethod.CTG` remains unavailable until the client wallet ledger is enabled;
- `PaymentMethod.PSE` and `POST /payments/pse/initiate` fail closed when `NODE_ENV=production` while the provider adapter remains sandbox/mock;
- TRANSFER remains the current candidate MVP rail and must still be exercised end-to-end before `paymentRailVerified` becomes `verified`.

This prevents a mock URL or synthetic provider flow from being interpreted by the web product as a real production payment rail.

## RC evidence that remains external

`docs/production/RC_READINESS.json` intentionally remains pending for:

- provider-level production backup configuration;
- dated provider-level non-destructive restore drill;
- alert escalation drill evidence;
- one real MVP payment rail verified end-to-end.

## Exit criteria

Phase 11B is technically complete when:

1. CI is green for backend and repository contracts;
2. `Nvet Recovery Readiness` is green on `main`;
3. Railway canonical deployment contract is green after the payment-controller change;
4. production backend deployment is healthy;
5. the incident escalation workflow is installed without weakening the health canary;
6. PSE sandbox initiation cannot execute in production.

Operational RC promotion still requires the four external evidence items above. No workflow or documentation change may convert them to `verified` without a concrete dated reference.
