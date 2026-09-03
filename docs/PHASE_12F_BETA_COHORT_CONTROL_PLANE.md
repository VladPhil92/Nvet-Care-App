# Phase 12F — Auditable Beta Cohort & Invitation Control Plane

## Purpose

Replace the static `NVET_CLOSED_BETA_CLIENT_HASHES` membership mechanism with an auditable, append-only cohort control plane operated from the Nvet Care admin dashboard.

This phase does **not** activate the Cartagena beta and does **not** authorize public/commercial launch. It removes one manual runtime dependency while preserving all RC and beta evidence gates.

## Canonical cohort source

Cohort membership is derived from `audit_logs` events with target type `BETA_COHORT_MEMBER`:

- `INVITED`
- `REVOKED`

The ledger is append-only. Membership history is never rewritten or deleted by the cohort service.

The legacy environment variable `NVET_CLOSED_BETA_CLIENT_HASHES` is no longer a canonical runtime membership source and must not participate in booking or activation decisions.

## Eligibility

A client can be invited only when the existing Nvet account:

1. has role `CLIENT`;
2. is active;
3. has a verified email;
4. is not already an active cohort member;
5. fits inside the Phase 12 maximum of 50 active members.

Membership eligibility is re-evaluated from the current `User` record. If an invited account later becomes inactive, unverified or changes to a non-client role, activation readiness and new beta bookings fail closed.

## API

### Client

- `GET /api/beta/cohort/me`
  - returns only the caller's invitation state and current legal-consent status.

### Admin / Superadmin

- `GET /api/beta/cohort`
  - returns active-member operational data, capacity, eligibility and legal-consent status.
- `POST /api/beta/cohort/invite`
  - accepts an existing client email and appends an `INVITED` event after eligibility validation.
- `POST /api/beta/cohort/:userId/revoke`
  - requires a reason and appends a `REVOKED` event.

## Privacy boundary

The cohort ledger stores the target Nvet user ID and event metadata, but does not duplicate the client's email into audit metadata. Email/name are resolved from `User` only for authenticated admin responses.

Public beta policy and readiness responses expose aggregate cohort counts, not member identifiers.

## Booking boundary

When `NVET_CLOSED_BETA_ENABLED=true`, a new appointment requires, in order:

1. booking kill switch enabled;
2. active time-bounded operator authorization;
3. active auditable cohort membership;
4. Cartagena market eligibility;
5. current explicit beta terms/privacy acceptance.

Any missing service or invalid state fails closed.

## Activation coupling

An activation authorization cannot be issued or remain operationally valid if:

- the cohort is empty;
- the cohort exceeds 50 active members;
- any active cohort member is currently ineligible;
- production evidence gates are incomplete;
- Cartagena verified-vet coverage is below 3;
- support owner/channel is missing;
- the market is not Cartagena.

## Admin dashboard

The Admin dashboard includes a **Cohorte Beta** view with:

- active/eligible/ineligible counts;
- remaining capacity;
- invitation by verified account email;
- per-member legal-consent status;
- append-only membership revocation.

## Evidence honesty

Implementation of this control plane does not set `clientCohortConfigured` to verified. That gate remains pending until real client accounts are invited and the resulting runtime snapshot is approved as evidence.

Likewise, `productionBackupConfigured` remains pending. The Railway production backup audit on 2026-09-03 observed zero automatic backup schedules and zero visible backups for the production PostgreSQL volume. This is a provider configuration blocker and is not altered or masked by Phase 12F.
