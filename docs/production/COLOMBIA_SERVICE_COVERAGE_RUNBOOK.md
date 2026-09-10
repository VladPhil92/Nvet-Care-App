# Colombia Service Coverage Runbook — Phase 14

## Objective

Make Nvet Care operationally safe for the Cartagena launch while keeping one codebase ready to expand across Colombia without implementing city-specific branches or rebuilding the app for every market.

The application may be distributed nationally. **Commercial service availability is controlled independently by Nvet market activation and veterinarian-level service radius.** Catalog presence is not launch authorization.

## Launch markets configured in code

| DANE | Market | Department | Default status |
| --- | --- | --- | --- |
| 13001 | Cartagena de Indias | Bolívar | ACTIVE |
| 11001 | Bogotá D.C. | Bogotá D.C. | PRELAUNCH |
| 05001 | Medellín | Antioquia | PRELAUNCH |
| 08001 | Barranquilla | Atlántico | PRELAUNCH |
| 68001 | Bucaramanga | Santander | PRELAUNCH |
| 68276 | Floridablanca | Santander | PRELAUNCH |
| 76001 | Cali | Valle del Cauca | PRELAUNCH |
| 70001 | Sincelejo | Sucre | PRELAUNCH |
| 23001 | Montería | Córdoba | PRELAUNCH |
| 47001 | Santa Marta | Magdalena | PRELAUNCH |

Bucaramanga and Floridablanca share the `bucaramanga-metropolitana` service group. Cross-municipal booking is allowed only when **both markets are active** and the service point remains inside the selected veterinarian's personal service radius.

## Runtime control plane

The market catalog is code-reviewed and stable. Commercial activation is provider configuration:

```text
NVET_ACTIVE_SERVICE_MARKETS=13001
```

The default when this variable is absent is also Cartagena (`13001`) only. Values may be comma-separated DANE codes or known market aliases. Unknown-only configuration fails closed and activates no market.

Production geographic enforcement is enabled by default. `NVET_BOOKING_GEO_ENFORCEMENT=false` exists only as an explicit operational escape hatch; it must not be used as a normal market-launch mechanism.

### Public endpoints

- `GET /api/coverage/markets` — active/prelaunch launch-market catalog.
- `GET /api/coverage/check?latitude={lat}&longitude={lng}` — resolves a device/service point to ACTIVE, PRELAUNCH or UNSUPPORTED.

### Admin endpoint

- `GET /api/coverage/readiness` — verified-vet and geo-ready-vet counts for every configured launch market. Requires ADMIN/SUPERADMIN authentication.

The readiness endpoint does not expose veterinarian coordinates.

## Booking safety boundary

A production booking must pass all of these checks:

1. The selected veterinarian is active and verified.
2. The mobile/web client supplies the service-point latitude and longitude.
3. The service point resolves to a configured Nvet launch market.
4. That market is ACTIVE.
5. The veterinarian belongs to the same active market, or to the same explicitly configured metropolitan group.
6. The veterinarian has valid service latitude/longitude and `serviceRadius`.
7. Haversine distance from the service point to the veterinarian's service location is less than or equal to the vet's `serviceRadius`.
8. Existing beta/legal/cohort/payment/availability gates still pass.

The mobile booking service obtains the device location immediately before creating the appointment. Phase 14 uses those coordinates for the coverage decision and does not add them to the Appointment persistence model.

> Operational rule: during this phase, the entered service address must correspond to the location where the client is requesting the home visit. A future address/place-picker layer may geocode alternate addresses before booking; until that exists, the device service point is the authoritative radius input.

## Cartagena closure

Cartagena remains the first closed-beta market. Nationalization does **not** remove or weaken the existing Cartagena controls.

Before operator activation, Cartagena must still have:

- at least 3 verified, active veterinarians whose `city` resolves to Cartagena;
- valid veterinarian latitude/longitude and a positive service radius for each veterinarian counted toward coverage;
- the controlled real-funds payment-rail evidence required by the release program;
- configured eligible client cohort;
- active support owner/channel and monitoring confirmation;
- documented privacy/terms review;
- verified booking kill-switch/rollback drill;
- RC promotion and the remaining release-control evidence.

`GET /api/beta/readiness` now counts only Cartagena veterinarians with service coordinates toward its minimum coverage gate.

## Opening another Colombian market

Do not activate a city just because it exists in the catalog. For each market:

1. Onboard at least 3 veterinarians and complete professional verification.
2. Confirm every launch veterinarian has city, department, latitude, longitude and service radius configured.
3. Check `GET /api/coverage/readiness`; `coverageSatisfied` must be `true` for that market.
4. Confirm market-specific support ownership, incident response, legal/privacy applicability, payment operation and commercial logistics.
5. Add its DANE code to `NVET_ACTIVE_SERVICE_MARKETS`. Example for Cartagena + Barranquilla:

   ```text
   NVET_ACTIVE_SERVICE_MARKETS=13001,08001
   ```

6. Deploy the provider configuration. No source-code change is required.
7. Smoke-test `/api/coverage/markets`, `/api/coverage/check`, vet discovery and a controlled booking path.
8. Start with a bounded cohort and observe incidents, cancellations, payment failures, supply and response times before expanding.

## Rollback

There are two independent levels of rollback:

- **Market rollback:** remove the affected DANE code from `NVET_ACTIVE_SERVICE_MARKETS` and redeploy provider configuration. Other active markets remain available.
- **Global booking rollback:** set `NVET_BOOKING_ENABLED=false`, preserving authentication, history and read paths while new bookings are paused.

For the Cartagena closed beta, the existing beta authorization and kill-switch runbooks remain authoritative.

## Privacy and location handling

Location is sensitive operational data. Clients must never be asked to paste coordinates into support tickets or evidence records. Public coverage endpoints return market-level information only. Admin readiness returns aggregate counts only. Exact veterinarian coordinates are not exposed by the coverage control plane.

## Expansion principle

The deployment unit is Nvet Care for Colombia. Cities are **operational service markets**, not separate application builds. Adding a newly engineered market requires a reviewed catalog change once; activating an already configured market requires readiness evidence and provider configuration, not a new app release.
