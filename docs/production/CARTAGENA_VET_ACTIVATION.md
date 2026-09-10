# Phase 18 — Cartagena Vet Supply Activation

## Purpose

Convert the national supply-readiness architecture into an operator workflow for the first real market: Cartagena de Indias (DANE 13001).

This phase does **not** create synthetic veterinarians, approve documents automatically, query an unofficial registry, activate Closed Beta, or submit operator evidence automatically.

## Operational definition

A veterinarian counts toward Cartagena coverage only when all of the following are true:

1. Declared market resolves to Cartagena de Indias (DANE 13001).
2. Service city, base coordinates and positive service radius are geo-consistent.
3. The three required verification documents are approved:
   - COMVEZCOL card
   - professional degree
   - identity document
4. Documentary verification is `APPROVED` and `isVerified=true`.
5. The official professional-registry check is `VERIFIED`.
6. The profile is active.

The market coverage threshold remains **3 operational geo-ready veterinarians**.

## Admin workspace

Dashboard → **Verificación VET** consumes:

- `GET /api/coverage/cartagena-activation`
- `POST /api/vets/admin/documents/:documentId/approve`
- `POST /api/vets/admin/documents/:documentId/reject`
- `GET /api/vets/admin/documents/:documentId/file`
- `POST /api/vets/registry/admin/:vetProfileId/check`

The activation snapshot is ADMIN/SUPERADMIN only. It exposes the minimum identity needed to process a professional-verification case but never returns exact coordinates or document storage URLs.

## Blocker order

The workspace resolves the next action in fail-closed order:

1. `SERVICE_AREA_MISSING`
2. `SERVICE_AREA_MISMATCH`
3. `DOCUMENT_REJECTED`
4. `DOCUMENTS_MISSING`
5. `VET_SUBMISSION_REQUIRED`
6. `DOCUMENT_REVIEW_REQUIRED`
7. `REGISTRY_CHECK_REQUIRED`
8. `REGISTRY_NOT_VERIFIED`
9. `ACTIVATION_INCONSISTENT`
10. `READY_FOR_CARTAGENA_SUPPLY`

## Professional registry

A `VERIFIED` registry decision must come from a real manual consultation of the official professional registry and must include meaningful evidence. Do not fabricate registry outcomes or use a platform state as proof of professional standing.

`NOT_FOUND`, `SANCTIONED`, and `UNAVAILABLE` remain fail-closed and cannot make a veterinarian operational.

## Evidence boundary

When the runtime snapshot reaches `operationalReady >= 3`, it changes only:

`formalEvidence.eligible = true`

It does **not** submit or approve the evidence gate.

The operator must still use **Operator Evidence Control** with:

- gate: `cartagena-vet-coverage`
- evidence kind: `runtime-snapshot`
- a candidate-bound SHA
- redacted runtime reference
- normal submission/approval controls

Until the resulting evidence PR is approved and merged, `cartagenaVetCoverageVerified` must remain pending.

## National expansion

The same professional-verification invariants apply to Bogotá, Medellín, Barranquilla, Bucaramanga, Floridablanca, Cali, Sincelejo, Montería and Santa Marta. Phase 18 intentionally gives Cartagena a dedicated operator closure surface because it is the first active market; it does not authorize the remaining PRELAUNCH markets.
