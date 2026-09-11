# Phase 30 — Cartagena Beta Observation Closure

## Objective

Phase 30 closes the seven-day Cartagena closed-beta observation cycle without confusing elapsed time with product success or commercial authorization. It composes the activation contract from Phase 29, the append-only observation ledger from Phase 25 and the aggregate service-quality telemetry from Phase 26.

Phase 30 adds no product feature and does not mutate provider configuration. Its purpose is to produce a reproducible technical-beta outcome from real production evidence.

## Prerequisites

Phase 30 cannot become operational until Phase 29 has actually activated a real Cartagena beta. The following remain prerequisites rather than software tasks:

- exact `1.0.0-rc.2` promotion completed and projected;
- all ten Beta Cartagena evidence gates verified;
- Phase 24 decision `GO`;
- real VET and CLIENT cohort active;
- bounded support and beta authorization active;
- `NVET_CLOSED_BETA_ENABLED=true` and intended booking gate deliberately enabled;
- Phase 25 observation record started for the current authorization.

A green Phase 30 workflow before those events means only that the closure contract is structurally valid.

## Canonical runtime sources

Phase 30 consumes aggregate/admin surfaces already implemented:

- `GET /api/beta/launch-readiness`;
- `GET /api/beta/launch-operations`;
- `GET /api/operations/service-quality?windowHours=168&marketDaneCode=13001`.

The runtime snapshot supplied to the verifier must be redacted and aggregate-only. It must not contain user, veterinarian or pet identifiers, addresses, coordinates, emails or phone numbers.

## Observation integrity

The observation must be bound to the same active beta `authorizationId` that started the Phase 25 ledger record. Phase 30 rejects:

- observation from an older authorization;
- an `ABORTED` observation as successful evidence;
- a closed record with less than 168 elapsed hours;
- Cartagena beta or booking gates disabled when the observation claims active operation;
- Phase 24/25 decisions other than `GO` for a successful closure;
- synthetic or backfilled time as a substitute for real elapsed duration.

The seven-day period cannot be accelerated by CI.

## Service-quality classification

Phase 30 uses the six Phase 26 required metrics:

1. service-start delay p95;
2. mature completion rate;
3. mature cancellation rate;
4. mature dispute rate;
5. resolved payment failure rate;
6. telemetry data-quality issue rate.

Phase 26 requires at least ten observations per metric before a metric can claim `PASS`, `WATCH` or `BREACHED`. Phase 30 preserves that semantic.

### Outcomes

- `BLOCKED`: Phase 29 has not completed or the runtime evidence is not yet eligible for observation.
- `OBSERVING`: a valid current-authority observation exists but has not yet reached a closeable/closed seven-day state.
- `PASSED_TECHNICAL_BETA`: observation is closed after at least 168 hours, Phase 24/25 remain `GO`, and all required SLO metrics are `PASS` with sufficient samples.
- `REVIEW_REQUIRED`: the observation is validly closed but at least one required metric is `WATCH` or `INSUFFICIENT_DATA`. This is an explicit human-review state, not a pass.
- `FAILED_TECHNICAL_BETA`: observation was aborted or at least one required metric is `BREACHED`.

A failed technical beta is still a legitimate observed outcome; it must never be rewritten as missing evidence.

## Runtime snapshot

The verifier supports an uncommitted JSON snapshot via:

```bash
node scripts/verify-cartagena-beta-observation-phase30.mjs --snapshot /secure/path/phase30-runtime.json
```

The snapshot is treated as ephemeral operational evidence and is converted into `.artifacts/phase30-cartagena-beta-observation-closure.json`. Raw runtime evidence must not be committed to the repository.

Without a runtime snapshot, the verifier emits a fail-closed engineering report describing the current static blockers.

## Safety boundaries

Phase 30 never:

- authorizes commercial launch;
- authorizes national expansion;
- publishes to Google Play;
- mutates Railway/provider flags;
- creates participants or production activity;
- synthesizes an observation window;
- auto-approves operator evidence;
- interprets elapsed time alone as technical success.

## Transition to Phase 31

After Phase 30 engineering closure, Phase 31 is Android Play Internal Release. Its engineering preparation can be automated, but Play Console ownership, app signing, upload certificate, signed AAB, internal-track upload and physical-device evidence remain external/provider boundaries.

A `PASSED_TECHNICAL_BETA` supports progression. `REVIEW_REQUIRED` permits controlled internal-release preparation but requires an explicit operator review before any broader release decision. `FAILED_TECHNICAL_BETA` blocks expansion until corrective action and a new observation cycle.
