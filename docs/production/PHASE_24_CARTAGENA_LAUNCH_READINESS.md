# Phase 24 — Cartagena Launch Readiness Cockpit

## Objective

Phase 24 consolidates the existing Cartagena closed-beta control planes into one read-only operational decision surface. It does not create new evidence, mutate provider configuration, approve launch gates or authorize a commercial launch.

The cockpit answers one bounded question: **is the Cartagena closed beta operationally ready to be enabled or continued right now?**

## Decision states

- `GO`: all hard prerequisites are satisfied. If the closed beta is disabled, the recommended action is to enable it only when the operator intentionally chooses to do so. If already enabled, the recommendation is to continue the controlled beta.
- `HOLD`: one or more mandatory launch prerequisites are missing, pending, conflicted or provider-blocked. The beta should remain disabled, or be remediated immediately if it is already active.
- `PAUSE`: the closed beta is enabled while the booking kill switch is off. The cockpit treats this as an intentional operational pause and does not reinterpret it as a generic readiness failure.

`GO` is a decision for the **Cartagena closed beta scope only**. It never means `commercialLaunchAuthorized=true`.

## Canonical sources

Phase 24 does not duplicate readiness data. It reconciles:

1. `GET /api/beta/readiness` — closed-beta machine readiness, evidence promotion, support, cohort, activation authorization and strict Cartagena VET supply.
2. `GET /api/coverage/launch-policy` — provider market request, launch guard and booking-gate eligibility.
3. `GET /api/recruitment/vets/activation-telemetry?marketDaneCode=13001` — Phase 23 recruitment SLA and activation pipeline health.

The strict veterinarian supply source remains `GET /api/coverage/cartagena-activation`. Recruitment lead counts never substitute for operational veterinarian counts.

## Evidence categories

The ten production evidence gates already enforced by the Cartagena beta control plane are grouped for operator readability:

- **Release:** `rcPromoted`.
- **Infrastructure:** `productionBackupConfigured`, `restoreDrillVerified`, `productionAlertingVerified`.
- **Financial:** `paymentRailVerified`.
- **Supply:** `cartagenaVetCoverageVerified`.
- **Operations:** `clientCohortConfigured`, `supportOwnerConfirmed`, `rollbackDrillVerified`.
- **Legal:** `privacyAndTermsReviewed`.

Every evidence gate remains blocking and production-scoped. Staging evidence is not promoted to production readiness.

## Recruitment resilience boundary

Phase 23 telemetry is displayed as a resilience signal. `AT_RISK`, `BREACHED` and `CRITICAL` recruitment leads generate cockpit warnings, but they do not become hard launch blockers when strict verified VET supply is already satisfied.

This prevents two opposite errors:

- counting unverified recruitment leads as operational supply;
- blocking a valid launch solely because the acquisition pipeline contains additional candidates still progressing through onboarding.

## API

`GET /api/beta/launch-readiness`

Access: `ADMIN` and `SUPERADMIN` only.

The response includes:

- `decision.state`: `GO | HOLD | PAUSE`;
- explicit hard `blockers` and non-blocking `warnings`;
- evidence completion percentage;
- strict operational VET supply progress;
- provider/runtime state;
- evidence categories and gate status;
- Phase 23 recruitment resilience summary;
- source and safety boundaries.

## Dashboard

The admin Dashboard exposes a new **Lanzamiento CTG** page containing:

- the current GO/HOLD/PAUSE decision;
- the recommended operator action;
- evidence and strict VET supply progress;
- runtime and activation authorization state;
- gate status by domain;
- hard blockers and resilience warnings;
- activation-pipeline totals and top bottlenecks.

## Fail-closed boundaries

Phase 24 must preserve all of the following:

- `commercialLaunchAuthorized: false`;
- no automatic approval or mutation of beta evidence;
- no mutation of Railway/provider environment configuration;
- no automatic beta authorization;
- no substitution of recruitment leads for verified operational VET supply;
- a disabled market guard is a hard blocker;
- pending or conflicted production evidence is a hard blocker;
- inactive beta authorization is a hard blocker;
- the booking kill switch produces `PAUSE` when the beta is active.

## Next phase enabled

Once the cockpit is merged and running, the next logical phase is an **operator launch checklist and evidence-expiry watch**: time-bound readiness leases, expiring authorization/evidence alerts, controlled activation runbook execution and post-launch observation-window telemetry without silently mutating provider state.
