# Phase 19 — Beta Supply Readiness Convergence

## Objective

Make the Cartagena closed-beta activation path consume the same strict veterinarian-supply definition introduced by Phase 18. No beta authorization or new booking may rely on a weaker city-only count.

## Canonical supply source

The canonical runtime source is `GET /api/coverage/cartagena-activation` through `CartagenaVetActivationService`.

A veterinarian contributes to the Cartagena launch threshold only when all of the following are true:

- the declared service city resolves to Cartagena DANE `13001`;
- service coordinates and positive radius exist;
- the coordinates resolve to the same configured market as the declared city;
- all required verification documents are approved;
- the professional registry check is `VERIFIED`;
- `verificationStatus=APPROVED`;
- `isVerified=true`;
- `isActive=true`.

The minimum remains three operational veterinarians.

## Convergence boundaries

`BetaActivationService.getPrerequisites()` now obtains `operationalReady`, `coverageGap`, minimum supply and formal-evidence eligibility from the Phase 18 service. It no longer performs a looser database count by city name.

`BetaReadinessService.getCartagenaSnapshot()` uses the same source for the local supply decision and exposes only aggregate information. Exact veterinarian coordinates are not included in the beta readiness response.

This closes a previous policy split where Phase 18 could report that Cartagena was not supply-ready while the beta authorization path could still see three `isVerified/isActive` city-matched profiles and consider the supply prerequisite satisfied.

## Fail-closed behavior

If strict operational supply falls below three after an authorization was issued, `BetaActivationService.assertActiveForBooking()` detects prerequisite drift and rejects new bookings. Existing history and authentication remain unaffected.

If the Closed Beta provider flags are enabled while strict supply, evidence, cohort or support prerequisites are incomplete, `/api/beta/readiness` reports `misconfigured` rather than treating the beta as validly active.

## Evidence boundary

This phase does **not** mark `cartagena-vet-coverage` verified. The Phase 18 runtime snapshot may declare that the evidence is eligible to be submitted, but formal operator evidence still requires the existing append-only submission and approval process.

The payment rail remains independent and pending until controlled real funds movement is evidenced. No RC promotion, Closed Beta activation, Google Play release, legal approval or payment-provider state is fabricated by this phase.

## Regression requirements

CI must prove that:

1. a healthy Phase 18 supply snapshot allows the supply portion of beta prerequisites;
2. two operational veterinarians keep activation blocked;
3. supply drift after authorization blocks new bookings;
4. the beta readiness snapshot reports the Phase 18 source and coverage gap;
5. evidence, cohort, support and market gates remain independent prerequisites.
