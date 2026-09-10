# Phase 21 — Veterinarian Invitation & Conversion Automation

## Objective

Convert Phase 20 recruitment leads into traceable veterinarian onboarding invitations without weakening the canonical professional-verification or market-coverage boundaries.

## Runtime flow

1. An ADMIN or SUPERADMIN selects a real recruitment lead.
2. Nvet issues a cryptographically random 256-bit bearer token.
3. Only the SHA-256 digest is persisted in the append-only invitation ledger.
4. The raw token is placed in the URL fragment (`#vetInvite=...`) so it is not sent to the web origin during initial navigation.
5. The mail provider must accept the message before the invitation becomes ACTIVE.
6. A successful send advances the Phase 20 outreach state to INVITED and schedules a follow-up automatically (48 hours by default).
7. The recipient sees an invitation-bound VET registration flow. The invited email cannot be changed in that flow.
8. After authentication as a matching active VET account, the invitation is claimed exactly once through a serializable database transaction.
9. Existing VET onboarding continues to enforce profile completion, geo-consistent service area, required professional documents, registry verification, administrator approval and active status.

## Security boundaries

- Raw invitation tokens are never written to the database or returned by admin summary APIs.
- Preview and claim APIs receive tokens in request bodies rather than URL paths.
- A token is valid only after `SEND_ACCEPTED`, before expiry, and while not claimed or superseded.
- Reissuing an invitation supersedes the previous active token.
- Production invitation sending fails closed unless the implemented SendGrid driver, `SENDGRID_API_KEY`, and an HTTPS `NVET_PUBLIC_APP_URL` are configured.
- Provider acceptance means the provider accepted the send request; it is not represented as proof of inbox delivery.
- A lead or invitation never counts as veterinarian coverage.
- Invitation claim requires an authenticated active `VET` whose normalized email matches the invited lead.
- Invitation issuance does not approve credentials, activate Cartagena beta, promote the RC, enable payments/PSE, or authorize a commercial market.

## Operator surfaces

- `GET /api/recruitment/vets/invitations/summary`
- `POST /api/recruitment/vets/:leadId/invite`
- `POST /api/recruitment/vet-invitations/preview`
- `POST /api/recruitment/vet-invitations/claim`
- Admin Dashboard → `Invitaciones VET`

## External configuration still required

The code path is deployable without external mail credentials, but production sends remain unavailable until a real mail provider is configured. Do not place provider credentials in repository files, issues, PR comments or chat transcripts.
