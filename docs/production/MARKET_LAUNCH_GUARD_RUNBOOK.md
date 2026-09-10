# Phase 15 — Market Launch Guard

## Purpose

Phase 14 prepared Nvet Care for service coverage in Cartagena, Bogotá, Medellín, Barranquilla, Bucaramanga, Floridablanca, Cali, Sincelejo, Montería and Santa Marta. Phase 15 adds a second fail-closed operational boundary so adding a city to provider configuration cannot, by itself, make that city bookable.

## Runtime controls

- `NVET_ACTIVE_SERVICE_MARKETS`: provider intent. A market must be present here before it can accept bookings.
- `NVET_NATIONAL_EXPANSION_ENABLED`: national expansion lock. Defaults to locked unless its exact value is `true`.
- `NVET_MARKET_LAUNCH_GUARD_ENABLED`: launch guard. In production it is enabled by default; only an explicit `false` disables it.
- `NVET_BOOKING_GEO_ENFORCEMENT`: Phase 14 market/radius enforcement. It remains independent and should stay `true` in production.

Cartagena (`13001`) does not require the national expansion flag because it is the initial market, but it still requires the minimum geo-ready veterinarian supply plus the existing Cartagena beta/evidence controls.

## Minimum supply gate

A market needs at least **3** veterinarians that are simultaneously:

- `isVerified = true`
- `isActive = true`
- `verificationStatus = APPROVED`
- latitude configured
- longitude configured
- `serviceRadius > 0`

The guard is evaluated before a new `POST /api/appointments` booking reaches the appointment domain service. A request is rejected if either the selected veterinarian market or the service-point market does not satisfy the supply gate.

## National rollout sequence

For every city after Cartagena:

1. Keep `NVET_NATIONAL_EXPANSION_ENABLED=false` while recruiting and verifying supply.
2. Onboard at least 3 geo-ready verified veterinarians in the target market.
3. Confirm support ownership, legal/privacy applicability, payments and incident response for the target market.
4. Add the target DANE code to `NVET_ACTIVE_SERVICE_MARKETS` while expansion remains locked. The admin launch-policy snapshot should report `EXPANSION_LOCKED`, not booking eligibility.
5. Review `GET /api/coverage/readiness` and `GET /api/coverage/launch-policy` as ADMIN/SUPERADMIN.
6. When the first national expansion wave is formally authorized, set `NVET_NATIONAL_EXPANSION_ENABLED=true`.
7. Verify the target market reports `BOOKING_GATE_ELIGIBLE`. This state means it passed this technical gate; it is **not** a statement that commercial launch is legally or operationally authorized.
8. Run controlled booking/payment/device smoke tests in the city before public acquisition campaigns.

## Safe rollback

To stop all non-Cartagena expansion without changing code, set:

```text
NVET_NATIONAL_EXPANSION_ENABLED=false
```

To remove one market only, remove its DANE code from:

```text
NVET_ACTIVE_SERVICE_MARKETS
```

To stop all new bookings platform-wide, use the existing booking kill switch rather than disabling geographic enforcement.

## Initial production configuration

During the Cartagena launch the expected configuration is:

```text
NVET_ACTIVE_SERVICE_MARKETS=13001
NVET_NATIONAL_EXPANSION_ENABLED=false
NVET_MARKET_LAUNCH_GUARD_ENABLED=true
NVET_BOOKING_GEO_ENFORCEMENT=true
```

This keeps the national code path deployed and testable while preventing accidental service activation outside Cartagena.

## City catalog

| City | DANE | Initial state |
| --- | --- | --- |
| Cartagena de Indias | 13001 | Initial market |
| Bogotá D.C. | 11001 | Prelaunch |
| Medellín | 05001 | Prelaunch |
| Barranquilla | 08001 | Prelaunch |
| Bucaramanga | 68001 | Prelaunch |
| Floridablanca | 68276 | Prelaunch |
| Cali | 76001 | Prelaunch |
| Sincelejo | 70001 | Prelaunch |
| Montería | 23001 | Prelaunch |
| Santa Marta | 47001 | Prelaunch |

Bucaramanga and Floridablanca retain their Phase 14 metro relationship. Cross-municipal service still requires both markets to pass provider activation, expansion lock and minimum supply gates, and the selected veterinarian's service radius must contain the service point.
