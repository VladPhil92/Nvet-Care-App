# Phase 12D — Beta Evidence Intake & Promotion Control Plane

**Program:** `closed-beta-cartagena`  
**Scope:** operator evidence intake, append-only review history and activation eligibility  
**Safety posture:** fail-closed; evidence approval never authorizes commercial launch

## 1. Objective

Phase 12C made the local runtime state explicit. Phase 12D closes the next gap: evidence that necessarily originates outside repository tests now has a durable administrative path instead of living only in prose, screenshots or manually edited manifests.

The control plane answers two separate questions:

1. **Is the local runtime technically healthy?** — cohort, veterinarian coverage, support configuration and kill switches.
2. **Has every required external/operator gate been supported by approved, non-expired evidence?** — provider backup, restore drill, real payment rail, legal review and the remaining beta gates.

Only when both are true may `GET /api/beta/readiness` report `ready-to-enable`.

## 2. Canonical ledger

Evidence events reuse the existing `audit_logs` table. No parallel evidence database or mutable status row is introduced.

Each evidence record has an immutable `evidenceId`. Its event stream is:

```text
SUBMITTED -> APPROVED
          -> REJECTED
APPROVED  -> REVOKED
```

The service never updates or deletes an evidence event. A conflicting event sequence is treated as a forensic integrity problem and the affected gate fails closed.

## 3. Evidence identity and privacy

A submission stores:

- gate;
- environment (`production` or `staging`);
- evidence reference;
- SHA-256 fingerprint of that reference;
- observation timestamp;
- optional expiration timestamp;
- optional short note;
- internal admin actor and audit metadata.

Evidence references are admin-only. Raw cohort identifiers, cohort hashes, support routes and participant PII are not returned by the control plane. References that appear to contain credentials, bearer tokens, API keys, passwords or secrets are rejected before persistence.

## 4. Administrative API

All endpoints require the canonical authenticated `ADMIN` capability; `SUPERADMIN` inherits it through the existing role guard.

```text
GET  /api/beta/evidence/summary
GET  /api/beta/evidence/history
POST /api/beta/evidence
POST /api/beta/evidence/:evidenceId/approve
POST /api/beta/evidence/:evidenceId/reject
POST /api/beta/evidence/:evidenceId/revoke
```

`GET /api/beta/evidence/summary` derives the current gate state from the event ledger. It never mutates the static manifest.

## 5. Expiration and contradiction handling

Evidence with an explicit `expiresAt` becomes `EXPIRED` automatically when that timestamp passes. Expired evidence cannot be approved and no longer satisfies its gate.

Invalid event order, multiple submission identities or a gate identity change produce `CONFLICTED`. A conflicted gate blocks operator activation even if another event looks superficially approved.

## 6. Promotion semantics

The ten required gates are kept in code and checked against the keys of `docs/production/BETA_CARTAGENA_READINESS.json` in CI. Gate drift therefore fails the Cartagena contract.

The runtime promotion calculation is:

```text
operatorActivationEligible =
  localRuntimeReady
  AND every evidence gate == VERIFIED
  AND conflictedGates == 0
```

The following remains invariant:

```text
commercialLaunchAuthorized = false
```

This phase creates **eligibility for an operator activation decision**. It does not make that decision and does not toggle `NVET_CLOSED_BETA_ENABLED`.

## 7. Dashboard

The admin dashboard exposes **Evidencia** as a first-class operational page. It includes:

- overall evidence progress;
- current runtime state;
- gate-by-gate status;
- evidence submission form;
- approve/reject/revoke controls;
- append-only evidence history;
- explicit warning that commercial launch is not authorized by evidence approval alone.

## 8. Existing manifest evidence

The static readiness manifest remains the policy/reference record and is deliberately not auto-mutated. Existing verified evidence, such as the production alerting drill, must be registered in the control plane if operators want it to count toward runtime activation eligibility. This duplication is intentional during transition: it forces an explicit operator acknowledgement rather than silently importing historical approval.

## 9. CI contract

`Cartagena Closed Beta Readiness` now verifies:

- the evidence gate list exactly matches the manifest;
- the ledger is append-only;
- all evidence endpoints exist;
- runtime readiness depends on evidence eligibility;
- the dashboard exposes the control plane;
- the manifest still forbids automatic evidence promotion.

The phase is mergeable only when this contract and the repository-wide `CI Success` gate are green.
