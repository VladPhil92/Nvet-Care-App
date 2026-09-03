# Cartagena Closed Beta — Operations, Support & Rollback Runbook

**Phase:** 12  
**Program:** `closed-beta-cartagena`  
**Status:** operational contract; launch evidence remains separate

## 1. Purpose

This runbook defines the operator-controlled actions required before and during the Cartagena closed beta. Repository tests prove the application contract; they do **not** replace provider-side execution evidence.

## 2. Required support configuration

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

## 3. Critical incident target

Phase 12 targets triage initiation within **30 minutes** for a P0/P1 beta incident. Immediate stop conditions include:

- data loss or corruption;
- authorization bypass or privilege escalation;
- systemic duplicate charge or financial inconsistency;
- inability to complete the core appointment lifecycle;
- sustained backend readiness degradation;
- any active P0 incident.

## 4. Booking rollback / kill switch

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
4. Verify an authenticated CLIENT attempting a new booking receives `BOOKING_TEMPORARILY_DISABLED`.
5. Verify the same account can still authenticate/refresh its session.
6. Verify the account can still read its existing appointment history.
7. Verify an existing appointment remains readable/manageable according to its current state.
8. Restore `NVET_BOOKING_ENABLED=true` only after the drill evidence is captured and there is no active incident requiring the block.
9. Repeat the new-booking probe and confirm the expected normal beta gate is restored.

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

## 5. Legal acceptance operations

The current beta contract is exposed by `GET /api/beta/legal`. CLIENT and VET participants accept it through `POST /api/beta/legal/accept` using the exact versions returned by the API.

While `NVET_CLOSED_BETA_ENABLED=true`, new client bookings require a current legal acceptance. A stale version, missing acceptance or missing legal service wiring fails closed.

The append-only audit entry records only the internal account identifier, role, program, versions and acceptance timestamp. Terms/privacy content is versioned in `docs/legal/`.

## 6. Evidence that must remain external

This runbook does not certify and must not simulate:

- Railway/provider automatic production backups;
- provider-level restore drill;
- real bank funds movement for the payment rail;
- real Cartagena veterinarian coverage;
- real client cohort provisioning.

Those gates remain blocked until their corresponding evidence exists.

## 7. Launch authority

The beta remains **NO LANZADA** until every `requiredEvidence` item in `docs/production/BETA_CARTAGENA_READINESS.json` is `verified` and the strict Cartagena readiness audit passes. Repository merge alone never activates commercial access.
