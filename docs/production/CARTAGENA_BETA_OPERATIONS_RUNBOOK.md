# Cartagena Closed Beta — Operations, Support & Rollback Runbook

**Phase:** 12  
**Program:** `closed-beta-cartagena`  
**Status:** operational contract; launch evidence remains separate

## 1. Purpose

This runbook defines the operator-controlled actions required before and during the Cartagena closed beta. Repository tests prove the application contract; they do **not** replace provider-side execution evidence.

## 2. Operational activation state

`GET /api/beta/readiness` is the canonical redacted runtime decision endpoint for the Cartagena beta. It reports one of five machine states:

| State | Meaning | Operator interpretation |
|---|---|---|
| `blocked` | One or more local machine gates are missing while the beta gate is still disabled. | Fix the reported local blockers. Do not enable the beta. |
| `ready-to-enable` | Cohort, Cartagena vet coverage and support configuration satisfy the local machine contract while the beta gate remains disabled. | This is **not** launch approval. Verify every external evidence item before enabling the beta. |
| `active` | The beta gate and booking are enabled and all local machine gates pass. | Continue observation and incident monitoring. This state alone does not prove launch authorization. |
| `paused` | The beta gate remains enabled but `NVET_BOOKING_ENABLED=false`. | New bookings are intentionally stopped while account access and existing data remain available. |
| `misconfigured` | The beta gate is enabled while one or more local machine gates fail. | Treat as an unsafe configuration. Correct the blockers or disable the beta gate. |

The response includes only redacted counts/booleans and blocker codes. It must not expose cohort hashes, raw user identifiers or support contact values.

The field `activation.machineActivationReady` means only that the local runtime contract passes. The field `activation.commercialLaunchAuthorized` is intentionally `false`: commercial launch authority comes from the evidence manifest and operator approval, not from a runtime boolean.

## 3. Local machine gates

The runtime considers local activation ready only when all of the following are true:

1. the client cohort is configured;
2. the cohort does not exceed the initial cap;
3. at least three verified and active Cartagena veterinarians are available;
4. `NVET_BETA_SUPPORT_OWNER` is configured;
5. `NVET_BETA_SUPPORT_CHANNEL` is configured.

These checks are operational readiness signals, not substitutes for the corresponding evidence records in `docs/production/BETA_CARTAGENA_READINESS.json`.

## 4. Required support configuration

Production must define both variables before `supportOwnerConfirmed` can be promoted:

- `NVET_BETA_SUPPORT_OWNER`: accountable operator name or stable operational role.
- `NVET_BETA_SUPPORT_CHANNEL`: official escalation destination used by the beta cohort and incident responders.

`GET /api/beta/readiness` exposes only whether each value is configured. It deliberately does not return the owner or channel contents.

### Confirmation evidence

Retain a dated, redacted evidence record containing:

1. responsible owner/role;
2. official support/escalation route;
3. confirmation that the route is monitored during the beta window;
4. responsible approver and date.

Do not commit private phone numbers, personal emails, tokens or provider secrets to the repository.

## 5. Critical incident target

Phase 12 targets triage initiation within **30 minutes** for a P0/P1 beta incident. Immediate stop conditions include:

- data loss or corruption;
- authorization bypass or privilege escalation;
- systemic duplicate charge or financial inconsistency;
- inability to complete the core appointment lifecycle;
- sustained backend readiness degradation;
- any active P0 incident.

## 6. Booking rollback / kill switch

The canonical emergency control is:

```text
NVET_BOOKING_ENABLED=false
```

This switch is intentionally separate from authentication and the cohort gate.

### Provider-level drill procedure

Run the drill in an operator-approved maintenance window before beta launch:

1. Capture the current production/staging configuration and candidate revision.
2. Set `NVET_BOOKING_ENABLED=false` through the canonical provider configuration.
3. Wait until the new runtime configuration is active.
4. Verify `GET /api/beta/readiness` reports `activation.state=paused` when the remaining local gates are satisfied.
5. Verify an authenticated CLIENT attempting a new booking receives `BOOKING_TEMPORARILY_DISABLED`.
6. Verify the same account can still authenticate/refresh its session.
7. Verify the account can still read its existing appointment history.
8. Verify an existing appointment remains readable/manageable according to its current state.
9. Restore `NVET_BOOKING_ENABLED=true` only after the drill evidence is captured and there is no active incident requiring the block.
10. Repeat the readiness/new-booking probes and confirm the expected normal beta gate is restored.

### Required evidence

The `rollbackDrillVerified` manifest gate may be changed to `verified` only after retaining redacted evidence containing:

- provider/environment;
- start/end timestamps;
- revision deployed;
- failed new-booking probe with the expected error code;
- successful authentication/history probes;
- restoration confirmation;
- operator/approver.

A unit test or CI contract alone is not sufficient evidence.

## 7. Legal acceptance operations

The current beta contract is exposed by `GET /api/beta/legal`. CLIENT and VET participants accept it through `POST /api/beta/legal/accept` using the exact versions returned by the API.

While `NVET_CLOSED_BETA_ENABLED=true`, new client bookings require a current legal acceptance. A stale version, missing acceptance or missing legal service wiring fails closed.

The append-only audit entry records only the internal account identifier, role, program, versions and acceptance timestamp. Terms/privacy content is versioned in `docs/legal/`.

## 8. Evidence that must remain external

This runbook does not certify and must not simulate:

- Railway/provider automatic production backups;
- provider-level restore drill;
- real bank funds movement for the payment rail;
- real Cartagena veterinarian coverage;
- real client cohort provisioning;
- responsible legal/privacy approval;
- responsible support-route confirmation;
- provider-level rollback drill execution.

Those gates remain blocked until their corresponding evidence exists.

## 9. Activation sequence

Only after every `requiredEvidence` item is `verified` and the strict readiness audit is green:

1. confirm `GET /api/beta/readiness` reports `ready-to-enable`;
2. record the exact production revision and operator/approver;
3. set `NVET_CLOSED_BETA_ENABLED=true` using the canonical provider configuration;
4. keep `NVET_BOOKING_ENABLED=true` only if there is no stop condition;
5. verify readiness reports `active` and the configured cohort can complete the intended booking path;
6. start the seven-day observation window defined in the readiness policy;
7. use `NVET_BOOKING_ENABLED=false` immediately if a stop condition is met.

If enabling the beta produces `misconfigured`, disable the beta gate or correct the blockers before allowing bookings.

## 10. Launch authority

The beta remains **NO LANZADA** until every `requiredEvidence` item in `docs/production/BETA_CARTAGENA_READINESS.json` is `verified` and the strict Cartagena readiness audit passes. Repository merge alone never activates commercial access.
