# Phase 12E — Controlled Beta Activation Authorization

## Objective

Convert Cartagena beta readiness into a fail-closed activation sequence. Evidence approval is necessary but is no longer sufficient to accept bookings: an ADMIN must issue a short-lived activation authorization after all production evidence and live runtime prerequisites pass.

## Activation sequence

1. Collect and approve all ten evidence gates through the append-only evidence control plane.
2. Only `environment=production` evidence can satisfy an activation gate. Staging evidence remains visible but cannot promote production.
3. Runtime must still prove: 1–50 configured invited clients, at least three verified/active Cartagena veterinarians, Cartagena market configuration, and configured support owner/channel.
4. `POST /api/beta/activation/authorize` issues an append-only authorization lease for 1–168 hours. Default: 24 hours.
5. The authorization does **not** mutate Railway or any provider variable. `NVET_CLOSED_BETA_ENABLED` remains a separate operator/provider action.
6. When the beta environment flag is enabled, every new booking requires a current authorization lease and re-checks live evidence/runtime prerequisites.
7. Evidence revocation/expiry, veterinarian coverage loss, cohort drift, support drift, market drift, authorization expiry or explicit revocation blocks new bookings fail-closed.
8. `NVET_BOOKING_ENABLED=false` remains the immediate kill switch and preserves authentication/history access.

## Activation states

- `blocked`: machine or evidence gates are incomplete.
- `awaiting-authorization`: machine and production evidence gates pass, but no current operator authorization exists.
- `ready-to-enable`: prerequisites pass and an authorization lease is active, while the provider beta flag remains off.
- `active`: provider beta flag is on, authorization is active, and booking is enabled.
- `paused`: beta remains enabled but the booking kill switch is off.
- `misconfigured`: provider beta flag is on without complete eligibility or a current authorization.

## Security boundaries

- Evidence ledger: `audit_logs`, append-only.
- Authorization ledger: `audit_logs`, append-only.
- No authorization endpoint writes provider configuration.
- No staging evidence can satisfy a production gate.
- No authorization can be issued while prerequisites are incomplete.
- No active authorization survives its expiry or explicit revocation.
- Commercial/public launch remains independently unauthorized.

## External blockers intentionally unchanged

This phase does not fabricate provider or human evidence. RC promotion, Railway backup verification, provider restore drill, real bank transfer, real veterinarian coverage, invited cohort, support confirmation, legal/privacy approval, and rollback drill must still be completed with real evidence before the authorization endpoint can succeed.
