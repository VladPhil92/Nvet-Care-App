# Phase 26 — Production Service Quality Telemetry & SLO

## Objective

Phase 26 turns persisted appointment and payment lifecycle timestamps into an ADMIN-only, aggregate operational-quality cockpit. It measures the Cartagena beta without creating synthetic history and without granting telemetry authority over launch, evidence or provider configuration.

## Canonical endpoint

`GET /api/operations/service-quality?windowHours=168&marketDaneCode=13001`

The endpoint is restricted to `ADMIN` and `SUPERADMIN` and defaults to Cartagena (`DANE 13001`) with a seven-day window. Supported windows are bounded to 1–720 hours and each read is capped at 5,000 appointment rows.

## Persisted measurement sources

Phase 26 uses existing durable fields only:

- appointment creation: `Appointment.createdAt`;
- veterinarian response: `Appointment.confirmedAt`;
- service start: `Appointment.inProgressAt`;
- service completion: `Appointment.completedAt`;
- current lifecycle outcome: `Appointment.status`;
- payment creation: `Transaction.createdAt`;
- payment verification: `Transaction.verifiedAt`;
- settlement: `Transaction.liquidatedAt`;
- payment outcome: `Transaction.status`.

Market assignment is reconciled through the existing `CoverageService.resolveMarketByCity()` catalog. The telemetry endpoint never exposes user IDs, veterinarian IDs, pet IDs, addresses or coordinates.

## Appointment quality

The response reports:

- appointments observed in the selected creation window;
- current status counts;
- confirmed-ever and completed-ever counts;
- confirmation, completion, cancellation and dispute rates;
- median/p95/max veterinarian response latency;
- median/p95/max confirmed-to-start latency;
- median/p95/max in-progress-to-completed duration.

### Assignment semantics

Nvet currently persists `vetId` when an appointment is created. There is no independent assignment event timestamp. Phase 26 therefore reports **veterinarian confirmation/response latency** (`createdAt -> confirmedAt`) and explicitly sets `assignmentLatencyMeasured=false`. It must not fabricate an assignment latency.

## Payment quality

The response reports:

- appointments with a transaction;
- transaction status and payment-method counts;
- verified and liquidated counts;
- failure and dispute rates;
- payment creation-to-verification latency;
- verification-to-liquidation latency.

Mixed payment methods can have different operational characteristics. Latency values are descriptive evidence unless a later provider-specific SLO is explicitly approved.

## Internal SLO policy

Initial internal beta targets are:

| Metric | Target |
|---|---:|
| VET response p95 | <= 30 min |
| Appointment completion rate | >= 85% |
| Appointment cancellation rate | <= 15% |
| Appointment dispute rate | <= 5% |
| Payment failure rate | <= 5% |
| Telemetry data-quality issue rate | <= 2% |

At least 10 observations are required before a metric can claim `PASS`, `WATCH` or `BREACHED`; otherwise it is `INSUFFICIENT_DATA`.

These are **internal operating objectives**, not customer promises, contractual SLAs or commercial-launch criteria. Phase 26 cannot alter the Phase 24/25 `GO / HOLD / PAUSE` decision.

## Measurement integrity

Phase 26 does not infer missing historical timestamps. It surfaces data-quality categories instead:

- lifecycle states missing their expected timestamps;
- cancellation records without a durable status-change timestamp;
- impossible appointment chronology;
- impossible payment chronology;
- appointments whose veterinarian market cannot be reconciled through the canonical coverage catalog.

Legacy gaps remain visible instead of being silently repaired with `updatedAt` or current time.

## Safety boundaries

- telemetry is read-only;
- no Prisma create/update/delete/upsert operation is allowed in the telemetry service;
- output is aggregate-only;
- no PII, address or coordinate is returned;
- no evidence is submitted or approved;
- no Railway/provider configuration is mutated;
- `commercialLaunchAuthorized` remains `false`;
- SLO state never automatically changes launch readiness.

## Dashboard

Admin navigation adds **Calidad CTG** with:

- overall SLO state;
- sample size and selected observation window;
- completion, cancellation and dispute outcomes;
- VET response and service latencies;
- transaction outcomes and payment latencies;
- data-quality issues;
- Phase 25 observation context and explicit launch-authority boundary.

## Next phase enabled

After Phase 26 is stable, Phase 27 can freeze a release candidate and execute a full regression/performance/security pass using the production-quality telemetry contract as one of the release evidence sources. New feature development should then stop unless a release-blocking defect is found.
