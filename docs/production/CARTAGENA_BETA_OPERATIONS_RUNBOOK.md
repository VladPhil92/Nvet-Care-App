# Cartagena Closed Beta — Operations, Support & Rollback Runbook

**Phase:** 12  
**Program:** `closed-beta-cartagena`  
**Status:** operational contract; launch evidence remains separate

## 1. Purpose

This runbook defines the operator-controlled actions required before and during the Cartagena closed beta. Repository tests prove the application contract; they do **not** replace provider-side execution evidence.

## 2. Operational activation state

`GET /api/beta/readiness` is the canonical redacted runtime decision endpoint for the Cartagena beta. It reports one of five states:

| State | Meaning | Operator interpretation |
|---|---|---|
| `blocked` | Local runtime gates or one or more evidence-ledger gates are incomplete while the beta gate is disabled. | Fix local blockers and/or register valid evidence. Do not enable the beta. |
| `ready-to-enable` | Local runtime gates pass and all ten evidence gates are approved, non-expired and non-conflicted while the beta gate remains disabled. | The system is eligible for an operator activation decision. This is still **not** commercial launch approval. |
| `active` | The beta gate and booking are enabled and operator activation eligibility remains satisfied. | Continue observation and incident monitoring. |
| `paused` | The beta remains eligible and enabled but `NVET_BOOKING_ENABLED=false`. | New bookings are intentionally stopped while account access and existing data remain available. |
| `misconfigured` | The beta gate is enabled before local runtime and evidence eligibility are both satisfied. | Treat as unsafe configuration. Disable the beta gate or repair the blockers. |

The response includes redacted counts/booleans and blocker codes. It must not expose cohort hashes, raw user identifiers, support contact values or evidence references outside admin-only evidence endpoints.

`activation.machineActivationReady` means only that the local runtime contract passes. `activation.operatorActivationEligible` additionally requires the evidence control plane to verify every required gate. `activation.commercialLaunchAuthorized` remains intentionally `false`.

## 3. Local machine gates

The runtime considers local activation ready only when all of the following are true:

1. the client cohort is configured;
2. the cohort does not exceed the initial cap;
3. at least three verified and active Cartagena veterinarians are available;
4. `NVET_BETA_SUPPORT_OWNER` is configured;
5. `NVET_BETA_SUPPORT_CHANNEL` is configured.

These checks are operational signals. The corresponding real-world assertions still require approved evidence in the Phase 12D evidence control plane.

## 4. Evidence control plane

The canonical live evidence registry is the append-only `audit_logs` ledger exposed through admin-only endpoints:

```text
GET  /api/beta/evidence/summary
GET  /api/beta/evidence/history
POST /api/beta/evidence
POST /api/beta/evidence/:evidenceId/approve
POST /api/beta/evidence/:evidenceId/reject
POST /api/beta/evidence/:evidenceId/revoke
```

Each evidence item moves only through the supported event sequence:

```text
SUBMITTED -> APPROVED
          -> REJECTED
APPROVED  -> REVOKED
```

Evidence with an explicit expiry ceases to satisfy its gate after expiry. A contradictory event stream becomes `CONFLICTED` and fails closed.

`docs/production/BETA_CARTAGENA_READINESS.json` remains the versioned policy/baseline manifest and is deliberately **not** auto-mutated by runtime approvals. After Phase 12D, operator activation eligibility is calculated from the live append-only evidence ledger, while the manifest continues to protect the required gate set and inherited historical evidence from silent drift.

## 5. Required support configuration

Production must define both variables before support readiness can pass:

- `NVET_BETA_SUPPORT_OWNER`: accountable operator name or stable operational role.
- `NVET_BETA_SUPPORT_CHANNEL`: official escalation destination used by the beta cohort and incident responders.

`GET /api/beta/readiness` exposes only whether each value is configured. It deliberately does not return the owner or channel contents.

### Confirmation evidence

Retain and register a dated, redacted evidence reference containing or pointing to:

1. responsible owner/role;
2. official support/escalation route;
3. confirmation that the route is monitored during the beta window;
4. responsible approver and date.

Do not submit private phone numbers, personal emails, tokens or provider secrets as evidence references.

## 6. Critical incident target

Phase 12 targets triage initiation within **30 minutes** for a P0/P1 beta incident. Immediate stop conditions include:

- data loss or corruption;
- authorization bypass or privilege escalation;
- systemic duplicate charge or financial inconsistency;
- inability to complete the core appointment lifecycle;
- sustained backend readiness degradation;
- any active P0 incident.

## 7. Booking rollback / kill switch

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
4. Verify `GET /api/beta/readiness` reports `activation.state=paused` when operator activation eligibility remains satisfied.
5. Verify an authenticated CLIENT attempting a new booking receives `BOOKING_TEMPORARILY_DISABLED`.
6. Verify the same account can still authenticate/refresh its session.
7. Verify the account can still read its existing appointment history.
8. Verify an existing appointment remains readable/manageable according to its current state.
9. Restore `NVET_BOOKING_ENABLED=true` only after the drill evidence is captured and there is no active incident requiring the block.
10. Repeat the readiness/new-booking probes and confirm the expected normal beta gate is restored.
11. Register the drill reference under `rollbackDrillVerified` and approve it only after operator review.

A unit test or CI contract alone is not sufficient evidence.

## 8. Legal acceptance operations

The current beta contract is exposed by `GET /api/beta/legal`. CLIENT and VET participants accept it through `POST /api/beta/legal/accept` using the exact versions returned by the API.

While `NVET_CLOSED_BETA_ENABLED=true`, new client bookings require a current legal acceptance. A stale version, missing acceptance or missing legal service wiring fails closed.

The append-only acceptance audit entry records only the internal account identifier, role, program, versions and acceptance timestamp. Terms/privacy content is versioned in `docs/legal/`.

The responsible legal/privacy review remains human-controlled and must be registered separately under `privacyAndTermsReviewed`.

## 9. Evidence that must remain external

The application can record and evaluate a reference, but it cannot manufacture the underlying event. The following must remain real external/operator evidence:

- Railway/provider automatic production backups;
- provider-level restore drill;
- real bank funds movement for the payment rail;
- real Cartagena veterinarian coverage;
- real client cohort provisioning;
- responsible legal/privacy approval;
- responsible support-route confirmation;
- provider-level rollback drill execution.

Do not mark an evidence item `APPROVED` unless the referenced event actually occurred and the reviewer inspected sufficient evidence.

## 10. Activation sequence

Only after `GET /api/beta/readiness` reports `activation.state=ready-to-enable` and `activation.operatorActivationEligible=true`:

1. review `GET /api/beta/evidence/summary` and confirm all ten gates are `VERIFIED` with zero conflicts;
2. record the exact production revision and operator/approver;
3. confirm there is no active P0/P1 incident or stop condition;
4. set `NVET_CLOSED_BETA_ENABLED=true` using the canonical provider configuration;
5. keep `NVET_BOOKING_ENABLED=true` only if there is no stop condition;
6. verify readiness reports `active` and the configured cohort can complete the intended booking path;
7. start the seven-day observation window defined in the readiness policy;
8. use `NVET_BOOKING_ENABLED=false` immediately if a stop condition is met.

If enabling the beta produces `misconfigured`, disable the beta gate or correct the blockers before allowing bookings.

## 11. Launch authority

The beta remains **NO LANZADA** until the live evidence control plane verifies every required gate, local readiness passes, and an authorized operator deliberately activates the provider-side beta configuration. Repository merge, CI success and evidence approval alone never activate commercial access.
