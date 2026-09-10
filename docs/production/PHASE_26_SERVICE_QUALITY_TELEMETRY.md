# Phase 26 — Production Service Quality Telemetry & SLO

## Objective

Phase 26 turns persisted appointment and payment lifecycle timestamps into an ADMIN-only, aggregate operational-quality cockpit. It measures the Cartagena beta without creating synthetic history and without granting telemetry authority over launch, evidence or provider configuration.

## Canonical endpoint

`GET /api/operations/service-quality?windowHours=168&marketDaneCode=13001`

The endpoint is restricted to `ADMIN` and `SUPERADMIN` and defaults to Cartagena (`DANE 13001`) with a seven-day window. Supported windows are bounded to 1–720 hours and each read is capped at 5,000 appointment rows.

## Persisted measurement sources

Phase 26 uses durable fields only:

- appointment creation: `Appointment.createdAt`;
- scheduled service: `Appointment.scheduledAt` when present, otherwise canonical `Appointment.date + Appointment.time` in Colombia time;
- booking confirmation: `Appointment.confirmedAt`;
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
- mature and immature appointment cohorts;
- completion, cancellation and dispute rates over mature outcomes only;
- booking-confirmation latency from `createdAt -> confirmedAt`;
- service-start delay relative to scheduled service time;
- confirmed-to-start latency;
- in-progress-to-completed duration.

A booking becomes outcome-mature when it is already terminal (`COMPLETED`, `CANCELLED` or `DISPUTED`) or when its scheduled service time plus the 180-minute completion grace has elapsed. Future appointments are therefore excluded from completion/cancellation/dispute denominators until they mature.

### VET-response and assignment semantics

Nvet currently persists `vetId` when an appointment is created. There is no independent assignment event timestamp. There is also no veterinarian-exclusive durable response timestamp: `confirmedAt` can be populated by financial confirmation flows and must therefore not be interpreted as a veterinarian response event.

Phase 26 consequently:

- sets `vetResponseMeasured=false`;
- does not include a VET-response SLO;
- treats `createdAt -> confirmedAt` only as booking-confirmation latency;
- sets `assignmentLatencyMeasured=false`;
- never fabricates assignment or veterinarian-response evidence.

The temporal operating SLO is instead **service-start delay p95**, calculated from the scheduled service time to `inProgressAt`. Mature appointments that have not started contribute an elapsed lower-bound observation, which prevents missing starts from disappearing through survivor bias.

## Payment quality

The response reports:

- appointments with a transaction;
- transaction status and payment-method counts;
- verified and liquidated counts;
- failure and dispute rates;
- payment creation-to-verification latency;
- verification-to-liquidation latency.

`PENDING` and `VERIFYING` transactions are excluded from the payment-failure denominator until they resolve. They are neither counted as failures nor treated as successful evidence.

## Internal SLO policy

Initial internal beta targets are:

| Metric | Target |
|---|---:|
| Service start delay p95 | <= 30 min |
| Mature appointment completion rate | >= 85% |
| Mature appointment cancellation rate | <= 15% |
| Mature appointment dispute rate | <= 5% |
| Resolved payment failure rate | <= 5% |
| Telemetry data-quality issue rate | <= 2% |

At least 10 observations are required **per metric** before it can claim `PASS`, `WATCH` or `BREACHED`; otherwise it is `INSUFFICIENT_DATA`. If any required metric remains `INSUFFICIENT_DATA`, the overall SLO also remains `INSUFFICIENT_DATA` rather than claiming unsupported health.

These are **internal operating objectives**, not customer promises, contractual SLAs or commercial-launch criteria. Phase 26 cannot alter the Phase 24/25 `GO / HOLD / PAUSE` decision.

## Measurement integrity

Phase 26 does not synthesize missing historical event timestamps. It surfaces data-quality categories instead, including:

- lifecycle states missing required service timestamps;
- cancellation records without a durable status-change timestamp;
- unresolved scheduled service time;
- payment states missing required verification/liquidation timestamps;
- impossible appointment chronology;
- impossible payment chronology;
- appointments whose veterinarian market cannot be reconciled through the canonical coverage catalog.

A `CONFIRMED` appointment without `confirmedAt` is tracked as a booking-confirmation coverage gap but is not classified as a VET-response failure, because `confirmedAt` is not a veterinarian-exclusive event.

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
- mature completion, cancellation and dispute outcomes;
- booking confirmation and service lifecycle latencies;
- transaction outcomes and payment latencies;
- data-quality issues;
- Phase 25 observation context and explicit launch-authority boundary.

Until a veterinarian-exclusive durable response event exists, the UI must not interpret booking confirmation as veterinarian response evidence.

## Next phase enabled

After Phase 26 is stable, Phase 27 can freeze a release candidate and execute a full regression/performance/security pass using the production-quality telemetry contract as one of the release evidence sources. New feature development should then stop unless a release-blocking defect is found.
