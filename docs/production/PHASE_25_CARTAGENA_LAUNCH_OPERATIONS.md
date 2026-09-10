# Phase 25 — Cartagena Operator Launch Control & Expiry Watch

## Objective

Phase 25 closes the operational gap between a Phase 24 `GO` decision and a safely observed Cartagena closed beta. It adds a durable observation ledger, expiry surveillance and an operator checklist without granting the application authority to mutate Railway/provider configuration or approve commercial launch.

## Canonical sources

Phase 25 consumes existing sources of truth instead of duplicating them:

- `GET /api/beta/launch-readiness` — Phase 24 GO/HOLD/PAUSE decision.
- `BetaActivationService` — active beta authorization and expiry.
- `BetaSupportService` — monitored support lease and expiry.
- `BetaEvidenceService` — approved production evidence and evidence expiry.
- Phase 18 strict Cartagena VET supply remains the supply source inherited through Phase 24.

## Operator endpoint

`GET /api/beta/launch-operations`

ADMIN/SUPERADMIN only. The response contains:

- Phase 24 decision and Phase 25 effective decision;
- operational blockers;
- operator action recommendation;
- observation-window state;
- 72h / 24h / 6h expiry watch;
- launch checklist;
- runtime and strict supply snapshot;
- immutable safety boundaries.

## Observation ledger

Observation records are append-only `audit_logs` events under target type `BETA_CARTAGENA_OBSERVATION`.

Supported mutations:

- `POST /api/beta/launch-operations/observation/start`
- `POST /api/beta/launch-operations/observation/close`
- `POST /api/beta/launch-operations/observation/abort`

Starting an observation requires all of the following at request time:

1. Phase 24 decision is `GO`.
2. Cartagena closed beta is enabled.
3. New bookings are enabled.
4. No active or conflicted observation window exists.

The minimum observation window is **7 days**. Closing is rejected before the seven-day threshold and is also rejected if Phase 24 is no longer `GO`.

Aborting a running observation requires a reason and incident reference. Abort records do not toggle the booking kill switch; the provider/runtime action remains deliberately separate.

## Effective decision

Phase 25 never weakens Phase 24:

- Phase 24 `PAUSE` → Phase 25 `PAUSE`.
- Phase 24 `HOLD` → Phase 25 `HOLD`.
- Phase 24 `GO` before beta activation → Phase 25 `GO`.
- Phase 24 `GO` with active beta but no durable observation record → Phase 25 `HOLD`.
- Phase 24 `GO` with an active, closable or closed observation record → Phase 25 `GO`.

An active beta without observation evidence is therefore fail-closed operational drift.

## Expiry watch

Phase 25 monitors the active beta authorization, support lease and production evidence with expiry timestamps.

Classification:

- `HEALTHY`: more than 72 hours remain.
- `ATTENTION`: 72 hours or less.
- `WARNING`: 24 hours or less.
- `CRITICAL`: 6 hours or less.
- `EXPIRED`: expiry has passed.
- `NON_EXPIRING`: no expiry timestamp exists.

The watch is read-only. A future expiry creates operator urgency but does not prematurely fabricate an expired state. Once a required control actually expires, the underlying Phase 24 source becomes blocking and the effective decision converges to `HOLD` or `PAUSE` as appropriate.

## Measurement integrity

Closing the seven-day observation record proves that the elapsed window was recorded. It does **not** by itself prove uninterrupted runtime health for every moment of the period. Production incident, availability and provider evidence must be reviewed separately before using the closed record as business evidence.

## Safety boundaries

- `commercialLaunchAuthorized` is always `false`.
- Phase 25 cannot approve beta evidence.
- Phase 25 cannot authorize beta activation.
- Observation events cannot mutate Railway/provider environment variables.
- Observation abort does not automatically toggle the booking kill switch.
- Observation closure cannot be represented as commercial launch authorization.
- Strict verified VET supply remains the operational supply source of truth.
- All operator mutations are append-only and auditable.

## Dashboard

The admin navigation adds **Operación CTG** with:

- effective decision and Phase 24 baseline;
- observation status and elapsed days;
- expiry-watch severity and earliest expiry;
- blocking checklist;
- operator recommendation;
- observation start/close/abort controls;
- control-by-control expiry table.

## Next phase enabled

After Phase 25, the next logical engineering increment is post-beta service-quality telemetry: booking success, assignment latency, cancellation/failure rates, veterinary response SLA and incident/SLO evidence, with explicit separation between technical beta success and commercial expansion approval.
