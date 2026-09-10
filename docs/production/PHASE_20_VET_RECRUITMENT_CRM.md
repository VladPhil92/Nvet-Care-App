# Phase 20 — Vet Recruitment CRM & Supply Conversion Funnel

## Objective

Give Nvet an operator-owned recruitment funnel for veterinarian acquisition without weakening the canonical supply-readiness boundary established in Phases 17–19.

The CRM tracks prospect outreach separately from real veterinarian onboarding. A lead, an invitation, or even a registered account never counts as operational supply by itself.

## Markets

The CRM accepts only the prepared Colombian launch markets from the Phase 14 catalog:

- Cartagena de Indias — DANE 13001
- Bogotá D.C. — 11001
- Medellín — 05001
- Barranquilla — 08001
- Bucaramanga — 68001
- Floridablanca — 68276
- Cali — 76001
- Sincelejo — 70001
- Montería — 23001
- Santa Marta — 47001

Cartagena remains the initial active market. Recruitment in a prelaunch market does not activate that market.

## Recruitment stages

Operator outreach uses the following append-only stages:

`NEW -> CONTACTED -> INTERESTED -> INVITED`

Any active stage may move to `LOST`. A lost lead may be reopened as `CONTACTED`. Repeated contact is represented by follow-up events rather than moving stages backwards.

## Durable ledger

Recruitment events are stored in the existing `audit_logs` append-only ledger with target type `VET_RECRUITMENT_LEAD` and program `vet-recruitment-crm-phase-20`.

The service never updates or deletes historical recruitment events. Current lead state is derived from the event stream. Reads fail closed if the safe event boundary is exceeded.

No Prisma migration is required for this phase.

## Real-account reconciliation

Lead email is normalized and reconciled against the canonical Nvet identity at read time. The CRM derives the current conversion stage from the real account and veterinarian profile:

- `LEAD_ONLY`
- `ACCOUNT_ROLE_MISMATCH`
- `ACCOUNT_EMAIL_UNVERIFIED`
- `ACCOUNT_REGISTERED`
- `SERVICE_AREA_REQUIRED`
- `DOCUMENT_REVIEW_REQUIRED`
- `REGISTRY_CHECK_REQUIRED`
- `VERIFICATION_APPROVAL_REQUIRED`
- `PROFILE_INACTIVE`
- `OPERATIONAL_READY`

`OPERATIONAL_READY` requires the same substantive controls used by the veterinarian activation path: VET identity, verified email, geo-consistent service area, required documents approved, real professional registry verification, APPROVED verification status, `isVerified=true`, and active account/profile.

## Coverage boundary

The CRM's market summary displays actual supply from `GET /api/coverage/supply-funnel`. Recruitment lead counts are never substituted for operational veterinarian counts.

A city can have many leads and still have `coverageGap > 0`. Commercial market activation remains controlled by the independent national market launch guard and operator evidence process.

## API

All endpoints are restricted to ADMIN/SUPERADMIN:

- `GET /api/recruitment/vets`
- `GET /api/recruitment/vets?marketDaneCode=13001`
- `POST /api/recruitment/vets`
- `POST /api/recruitment/vets/:leadId/stage`
- `POST /api/recruitment/vets/:leadId/follow-up`

No public recruitment-lead endpoint exposes contact information.

## Dashboard

The Admin Dashboard contains a new `Captación VET` workspace with:

- total and active lead counts;
- registered-account conversion count;
- CRM-linked operational-ready count;
- overdue follow-up count;
- city filter;
- candidate creation form;
- stage controls;
- follow-up scheduling;
- real account conversion state and next recommended action.

## Privacy and launch safety

Lead contact information is restricted to authorized administrators. Public coverage endpoints remain aggregate and PII-free.

This phase does not:

- fabricate veterinarian identities or registrations;
- approve professional verification;
- submit `cartagena-vet-coverage` evidence;
- activate Closed Beta;
- activate a new Colombian market;
- promote the RC;
- alter payment/PSE state;
- change Google Play or legal-controller state.
