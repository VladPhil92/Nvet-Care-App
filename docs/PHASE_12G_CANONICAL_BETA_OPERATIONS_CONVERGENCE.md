# Phase 12G — Canonical Beta Operations Convergence

**Status:** implementation paired with `VladPhil92/ctg_one_website#387`; commercial beta remains fail-closed.

## Objective

Move the operator-facing Beta Cartagena control plane to the only canonical web surface of Nvet Care: `ctgone.com/nvetcareapp`.

Phase 12D–12F already made the Nvet backend authoritative for evidence, activation authorization and cohort membership. Phase 12G closes the presentation/operations gap: the deprecated local `dashboard/` package may retain historical/reference components, but it is not a deployable production authority.

## Canonical topology

```text
SUPERADMIN browser session on ctgone.com
        ↓
CTG One Nvet server-side session/BFF
        ↓
allowlisted /api/nvetcareapp/admin/beta/** relay
        ↓
Nvet backend /api/beta/**
        ↓
audit_logs append-only ledgers + PostgreSQL domain state
```

Authority boundaries remain unchanged:

- CTG One/Supabase identifies the ecosystem session;
- the Nvet backend determines the effective Nvet role and every Beta rule;
- the browser never receives or chooses the Nvet bearer token;
- `X-Nvet-Acting-Role` is never synthesized as ADMIN/VET/SUPERADMIN/VET_TESTER;
- Vet Tester is presentation-only and cannot access the production Beta control plane;
- CLIENT mode cannot access privileged Beta operations.

## Canonical operator route

`/nvetcareapp/dashboard/beta`

The paired web implementation exposes the following backend authorities server-to-server:

### Read model

- `GET /api/beta/readiness`
- `GET /api/beta/cohort`
- `GET /api/beta/activation`
- `GET /api/beta/evidence/summary`
- `GET /api/beta/evidence/history`

### Mutations

- `POST /api/beta/cohort/invite`
- `POST /api/beta/cohort/:userId/revoke`
- `POST /api/beta/activation/authorize`
- `POST /api/beta/activation/revoke`
- `POST /api/beta/evidence`
- `POST /api/beta/evidence/:evidenceId/approve`
- `POST /api/beta/evidence/:evidenceId/reject`
- `POST /api/beta/evidence/:evidenceId/revoke`

The CTG One BFF uses an explicit method/path allowlist and bounded JSON bodies. Unknown paths fail closed.

## Operational truth

The web console is not a release bypass.

- Evidence from `staging` is informational and never satisfies a production gate.
- `commercialLaunchAuthorized` remains `false` in the current contract.
- Activation authorization is a temporary append-only lease and does not toggle Railway variables.
- Booking continues to revalidate active authorization, production evidence, cohort eligibility, veterinarian coverage, support readiness, market and legal acceptance.
- `NVET_BOOKING_ENABLED=false` remains the immediate booking kill switch.

## Phase 12G exit criteria

Repository implementation is complete when:

1. the paired `ctg_one_website` change is merged with its Beta Operations contract green;
2. `ctgone.com/nvetcareapp/dashboard/beta` is reachable only by the canonical root in real SUPERADMIN mode;
3. the production backend snapshot loads without demo/mock fallback;
4. a mutation through the BFF is rejected for CLIENT/Vet Tester and accepted only when NestJS authorizes it;
5. the web surface clearly preserves the difference between machine readiness, operator authorization and commercial launch approval.

## External gates intentionally not fabricated

Phase 12G does not mark operational facts as complete merely because a UI exists. The following remain evidence-driven:

- production Railway automatic backup schedule and visible backup;
- provider-level restore drill;
- controlled real TRANSFER funds movement;
- at least three verified/active Cartagena veterinarians;
- real invited CLIENT cohort;
- named support owner/channel confirmation;
- legal/privacy review;
- provider-level rollback drill;
- promotion of `1.0.0-rc.1`;
- explicit provider activation of the closed beta.

## Next transition

After Phase 12G code convergence, the program stops prioritizing new product features and moves into **Beta Evidence & Operator Activation Closure**: satisfy the real external gates, promote the RC, authorize a bounded lease, activate the provider flags in the documented sequence, and observe the controlled Cartagena cohort before Android/public rollout.
