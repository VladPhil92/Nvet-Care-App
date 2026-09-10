# Phase 17 — Vet Supply Acquisition & Market Readiness Control

## Purpose

Nvet must distinguish **platform availability**, **market configuration** and **real veterinarian supply**. A city is not launch-ready merely because it exists in the national catalog or appears in `NVET_ACTIVE_SERVICE_MARKETS`.

Phase 17 adds an admin-only, aggregate veterinarian supply funnel for each prepared Colombian market.

## Funnel

For every configured market Nvet measures:

1. VET profiles registered in the declared city.
2. Profiles with a service area (latitude, longitude and positive radius).
3. Profiles whose declared city and coordinates resolve to the same Nvet market.
4. Professional verification state: NONE, PENDING, IN_REVIEW, APPROVED, REJECTED or EXPIRED.
5. Approved and active veterinarians.
6. Operational geo-ready veterinarians: APPROVED + `isVerified=true` + `isActive=true` + geo-consistent service area.
7. Exact coverage gap against `MIN_VERIFIED_GEO_READY_VETS_PER_MARKET`.

Only step 6 contributes to the minimum supply gate.

## Supply stages

- `ACQUISITION_REQUIRED`: no VET profiles are registered for the market.
- `SERVICE_AREA_REQUIRED`: existing profiles need a complete or corrected service area.
- `VERIFICATION_REQUIRED`: geo-consistent profiles exist but none is approved and there is no active review.
- `VERIFICATION_IN_PROGRESS`: at least one profile is PENDING or IN_REVIEW.
- `COVERAGE_GAP`: approved supply exists but remains below the operational minimum.
- `SUPPLY_READY`: the market meets the minimum operational geo-ready supply threshold.

## Privacy boundary

`GET /api/coverage/supply-funnel` is ADMIN/SUPERADMIN only and returns **aggregate counts**. It does not return veterinarian names, emails, license numbers, document data or exact coordinates.

## Cartagena launch rule

Cartagena de Indias (`DANE 13001`) remains the initial operational market. It requires at least the configured minimum of approved, active and geo-consistent veterinarians before the supply gate can be considered ready.

Supply readiness does **not** complete or replace the independent RC, payment, support, privacy/legal, beta cohort, rollback or external evidence gates.

## National expansion

Bogotá, Medellín, Barranquilla, Bucaramanga, Floridablanca, Cali, Sincelejo, Montería and Santa Marta may accumulate VET registrations and progress through the same funnel while remaining PRELAUNCH.

A future market should only be activated after:

1. supply is `SUPPLY_READY`;
2. operational/legal/payment/support prerequisites for that market are approved;
3. its DANE code is deliberately added to `NVET_ACTIVE_SERVICE_MARKETS`;
4. national expansion is deliberately enabled where required by the Phase 15 launch guard.

No code deployment should be necessary merely to add an already-prepared market after those controls are satisfied.
