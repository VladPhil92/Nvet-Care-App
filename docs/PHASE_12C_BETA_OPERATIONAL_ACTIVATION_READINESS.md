# Phase 12C — Beta Operational Activation Readiness

## Objective

Convert the Cartagena closed-beta runtime from a collection of readiness booleans into an explicit, fail-closed operational activation model without turning repository automation into provider, legal, financial or human approval evidence.

## Delivered contract

The admin-only `GET /api/beta/readiness` endpoint now exposes an `activation` section with:

- `state`: one of `blocked`, `ready-to-enable`, `active`, `paused`, `misconfigured`;
- `machineActivationReady`: whether every local machine gate passes;
- `blockingReasons`: redacted machine-readable blocker codes;
- `externalEvidenceRequired: true`;
- `commercialLaunchAuthorized: false`.

The endpoint remains redacted: no cohort hashes, raw participant identifiers or support contact values are returned.

## Local machine gates

`machineActivationReady=true` requires all of the following:

1. a non-empty invited-client cohort;
2. cohort size at or below the initial cap of 50;
3. at least three verified, active veterinarians whose service city is Cartagena;
4. configured beta support owner;
5. configured beta support channel.

Support configuration is therefore no longer merely informational. A missing owner or route blocks local machine readiness.

## Operational state semantics

### `blocked`

The beta gate is disabled and one or more local machine gates fail. The response lists the blockers. The operator must not enable the beta.

### `ready-to-enable`

Every local machine gate passes while `NVET_CLOSED_BETA_ENABLED=false`.

This means only **machine-ready**. It does not authorize commercial launch. Every item in `docs/production/BETA_CARTAGENA_READINESS.json` must still be verified by its legitimate evidence source.

### `active`

The closed-beta gate and booking are enabled and local machine gates still pass. This is a runtime state, not proof that operator approval or external evidence exists.

### `paused`

The closed-beta gate remains enabled while `NVET_BOOKING_ENABLED=false`. New bookings are stopped through the canonical kill switch while account/session/history behavior remains independent.

### `misconfigured`

The closed-beta gate is enabled before local machine gates pass. This is treated as an unsafe operational configuration and should be corrected or disabled.

## Evidence boundary

This phase intentionally does **not** promote any of the following:

- `rcPromoted`;
- `productionBackupConfigured`;
- `restoreDrillVerified`;
- `paymentRailVerified`;
- `cartagenaVetCoverageVerified`;
- `clientCohortConfigured`;
- `supportOwnerConfirmed`;
- `privacyAndTermsReviewed`;
- `rollbackDrillVerified`.

`productionAlertingVerified` remains inherited as the only already-verified gate.

A runtime count or configuration boolean may support operator evidence collection, but it cannot mutate the readiness manifest autonomously.

## Certification

The existing `Cartagena Closed Beta Readiness` workflow now also runs `scripts/verify-beta-operational-activation-readiness.mjs`.

The verifier enforces:

- the exact activation-state vocabulary;
- support participation in machine readiness;
- fail-closed commercial authorization semantics;
- required blocker codes;
- preservation of pending external/operator evidence;
- preservation of the existing verified alerting evidence;
- absence of raw cohort-hash handling in the readiness response implementation.

## Promotion rule

Merging this phase does not launch the beta.

The beta can move from `ready-to-enable` to an operator-approved activation only when the strict Cartagena readiness audit has no blocked evidence gates and the provider-side activation sequence in `docs/production/CARTAGENA_BETA_OPERATIONS_RUNBOOK.md` is executed against the exact approved production revision.
