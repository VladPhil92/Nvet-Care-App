# Phase 23 — VET Activation Telemetry & Conversion SLA

## Objective

Phase 23 converts the veterinarian recruitment funnel into an operational management surface. It does **not** create veterinarian supply and it does **not** authorize commercial launch. Its purpose is to identify where a real candidate is blocked between recruitment and the already-existing `OPERATIONAL_READY` trust boundary.

The canonical endpoint is:

`GET /api/recruitment/vets/activation-telemetry`

It is protected by the existing `ADMIN` / `SUPERADMIN` recruitment controller boundary. An optional `marketDaneCode` filter uses the same launch-market contract as the Phase 20 CRM.

## Canonical progression

The telemetry layer reconciles durable evidence already produced by Nvet:

1. recruitment lead created;
2. contact permission recorded (Phase 22);
3. current invitation cycle issued and accepted by the configured mail provider (Phase 21);
4. invitation claimed;
5. Nvet account linked;
6. VET professional profile created;
7. required professional documents approved;
8. official professional registry verified;
9. administrator verification approved;
10. current profile reaches `OPERATIONAL_READY`.

No telemetry state can bypass the verification guard, coverage gate or financial controls.

## SLA defaults

The SLA engine is read-only and configurable by environment. Invalid or missing environment values fall back to these defaults:

| Blocker | Default SLA |
| --- | ---: |
| Contact permission required | 24 h |
| Invitation required after permission | 24 h |
| Invitation provider delivery pending | 1 h |
| Invitation reissue required | 4 h |
| Invitation claim required | 72 h |
| Account email unverified | 24 h |
| VET profile creation | 24 h |
| Service area completion | 24 h |
| Professional document review | 72 h |
| Official registry verification | 48 h |
| Administrator verification approval | 24 h |
| Profile reactivation | 24 h |

Environment variables:

- `NVET_SLA_CONTACT_PERMISSION_HOURS`
- `NVET_SLA_INVITATION_HOURS`
- `NVET_SLA_INVITATION_DELIVERY_HOURS`
- `NVET_SLA_INVITATION_REISSUE_HOURS`
- `NVET_SLA_INVITATION_CLAIM_HOURS`
- `NVET_SLA_EMAIL_VERIFICATION_HOURS`
- `NVET_SLA_PROFILE_CREATION_HOURS`
- `NVET_SLA_SERVICE_AREA_HOURS`
- `NVET_SLA_DOCUMENT_REVIEW_HOURS`
- `NVET_SLA_REGISTRY_CHECK_HOURS`
- `NVET_SLA_VERIFICATION_APPROVAL_HOURS`
- `NVET_SLA_PROFILE_REACTIVATION_HOURS`

At 75% of the configured SLA a lead becomes `AT_RISK`. At or above 100% it becomes `BREACHED`. Data conflicts, role conflicts, account-link anomalies and explicit invitation-delivery failures are `CRITICAL`. Lost leads are `PAUSED`. Current operational VETs are `COMPLETE`.

## Measurements

The response contains four views of the same canonical data:

- **funnel**: counts at each durable recruitment/activation milestone;
- **bottlenecks**: grouped blockers ranked by breached/critical count, volume and age;
- **priorityQueue**: actionable leads sorted by severity and blocker age;
- **markets**: SLA health combined with the existing operational coverage gap for each launch market.

The dashboard integrates these metrics into `Captación VET` so operators can see the activation queue beside the underlying CRM rather than using a second operational system.

## Timing precision

Consent, invitation, account, profile, document, registry and administrator-verification timestamps come from durable application records. The exact historical moment when every current-state predicate first became simultaneously true was not recorded before Phase 23.

For that reason, `operationalEvidenceAt` is deliberately described as a **lower-bound evidence timestamp** assembled from durable prerequisite timestamps. It must not be represented as an exact historical first-ready timestamp. This prevents the dashboard from claiming precision the repository does not actually possess.

## Launch boundary

Recruitment lead counts, consent records, invitations, accounts and SLA status never substitute for operational veterinarian counts. Launch readiness continues to use the canonical supply funnel and its verified, active and geo-consistent veterinarian requirements.

Phase 23 remains `commercialLaunchAuthorized: false` by design. A later launch-readiness phase may consume these metrics, but cannot reinterpret them as supply.
