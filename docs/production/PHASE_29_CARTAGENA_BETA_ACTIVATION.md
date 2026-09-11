# Phase 29 — Cartagena Beta Activation

## Objective

Phase 29 closes the orchestration gap between the frozen/promotable `1.0.0-rc.2` release candidate and a deliberately activated Cartagena closed beta. It does **not** create new product features and it does not treat repository completion as proof that real-world beta prerequisites occurred.

The phase is a fail-closed activation layer over the control planes already implemented in Phases 12, 18, 24, 25 and 26.

## Prerequisite

Phase 28 remains the release prerequisite. The beta may not become activation-eligible until the exact `1.0.0-rc.2` candidate is promoted and the resulting `rc-promoted` evidence is approved through Operator Evidence Control.

The immutable candidate remains the Phase 27 frozen release candidate. Phase 29 must reject protected-product drift from that candidate and must reject any open release blocker.

## Canonical sources

Phase 29 consumes, rather than duplicates, the existing authorities:

- `docs/production/PHASE_28_CONTROLLED_RC_PROMOTION.json` — RC promotion contract;
- `docs/production/RELEASE_CANDIDATE_FREEZE.json` — immutable product freeze;
- `docs/production/RELEASE_BLOCKERS.json` — exceptional product-change registry;
- `docs/production/BETA_CARTAGENA_READINESS.json` — ten production beta evidence gates;
- `docs/production/BETA_OPERATOR_ACTIVATION_CLOSURE.json` — fail-closed operator authorization boundary;
- `docs/production/GLOBAL_READINESS.json` — global engineering/operator separation.

The machine verifier is `scripts/verify-cartagena-beta-activation-phase29.mjs` and the CI/reporting workflow is `Nvet Cartagena Beta Activation Phase 29`.

## Required beta evidence

All ten production evidence gates remain blocking:

1. `rcPromoted`;
2. `productionBackupConfigured`;
3. `restoreDrillVerified`;
4. `productionAlertingVerified`;
5. `paymentRailVerified`;
6. `cartagenaVetCoverageVerified`;
7. `clientCohortConfigured`;
8. `supportOwnerConfirmed`;
9. `privacyAndTermsReviewed`;
10. `rollbackDrillVerified`.

A gate marked `verified` must contain a concrete evidence reference. Pending evidence is reported as an activation blocker; it is never auto-promoted by Phase 29.

## What remains real and external

The application and repository cannot manufacture the underlying facts for the following gates:

- at least three real Cartagena veterinarians satisfying the strict Phase 18 operational verification source;
- real verified CLIENT accounts invited into the append-only beta cohort;
- a real monitored support route with accountable owner, approver and confirmation date;
- responsible legal/privacy review of the beta terms and notice;
- a real provider-level `NVET_BOOKING_ENABLED=false` rollback drill and successful recovery;
- the real payment-rail movement inherited from RC closure;
- the exact RC tag/promotion evidence inherited from Phase 28.

Synthetic users, staging fixtures, repository documentation, CI success or internal database flags cannot substitute for these events.

## Runtime decision chain

Once all versioned evidence is verified, runtime activation still follows the existing operator chain:

1. `GET /api/beta/readiness` must show evidence/runtime eligibility;
2. `GET /api/coverage/cartagena-activation` must confirm strict verified VET supply;
3. `GET /api/beta/launch-readiness` must return Phase 24 `GO`;
4. support and activation authorization must be active and time-bounded;
5. the operator deliberately enables `NVET_CLOSED_BETA_ENABLED=true` through the canonical provider configuration;
6. `NVET_BOOKING_ENABLED=true` may remain enabled only when no stop condition exists;
7. readiness must converge to the expected active state;
8. Phase 25 observation is started through `POST /api/beta/launch-operations/observation/start`.

Phase 29 intentionally does not mutate the provider flags automatically.

## Authorization and observation windows

The operator activation authorization and support lease remain bounded to a maximum of **192 hours**. Before the seven-day Phase 25 observation begins, both must have at least **169 hours** remaining.

This provides the seven-day observation period plus closing buffer without allowing silent lease renewal.

## State model

The Phase 29 report has three conceptual states:

- `BLOCKED` — one or more required versioned beta evidence gates remain pending;
- `READY_FOR_OPERATOR_ACTIVATION` — all ten versioned evidence gates are verified; deliberate runtime/operator checks are still required before provider enablement;
- `ACTIVE_BETA_REQUIRES_OBSERVATION` — reserved for the subsequent runtime/observation stage after deliberate activation; versioned readiness alone must never fabricate this state.

The initial Phase 29 workflow runs in report mode so pending real-world evidence is visible without converting an expected operational blocker into a CI failure. An explicit `workflow_dispatch` can use `enforce_ready=true` when an operator expects every versioned gate to be closed.

## Safety boundaries

Phase 29 cannot:

- authorize commercial launch;
- publish to Google Play or another store;
- create synthetic veterinarians or clients to satisfy supply/cohort gates;
- auto-approve evidence;
- automatically enable or disable Railway/provider environment variables;
- replace legal/privacy review;
- claim a rollback drill occurred from unit or integration tests;
- bypass Phase 24 `GO`;
- substitute recruitment leads for verified operational VET supply.

`commercialLaunchAuthorized` remains `false` throughout the closed beta.

## Next stage

After deliberate beta activation, the next closure stage is **Phase 30 — Cartagena Beta Observation Closure**. It consumes the existing Phase 25 append-only observation ledger and Phase 26 service-quality telemetry to close a full seven-day beta observation window without conflating technical beta success with commercial expansion approval.
