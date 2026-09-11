# Phase 28 — External Evidence Closure & Controlled RC Promotion

## Objective

Phase 28 converts the Phase 27 frozen engineering candidate `1.0.0-rc.2` into an explicitly promotable release candidate without weakening any external-evidence, financial, provider, legal, beta or store boundary.

The phase does **not** add product features. Product code remains frozen under `RELEASE_CANDIDATE_FREEZE.json` and `RELEASE_BLOCKERS.json`.

## Starting state

Phase 27 froze the candidate with:

- candidate: `1.0.0-rc.2`;
- candidate commit: `bee7afd3382a63344e572f0856847db1d63eadac`;
- Android package: `com.nvetcare`;
- Android versionName: `1.0.0-rc.2`;
- Android versionCode: `10002`;
- feature freeze active;
- commercial launch unauthorized;
- public-store release unauthorized.

At Phase 28 entry, repository engineering, provider backup, provider restore, production alerting and repository governance are already represented as verified in the canonical manifests. The remaining RC external blocker is the real transfer rail.

## Current manual boundary

`RC_READINESS.json -> requiredExternalEvidence.paymentRailVerified` remains `pending` until a controlled real bank transfer exists and has independently retained, redacted evidence of actual funds movement.

Synthetic staging transfers, application state transitions, screenshots without independent bank-side movement, or machine certification alone do not satisfy this gate.

The corresponding Operator Evidence Control gate is `real-transfer-rail`.

## Phase 28 control plane

The canonical Phase 28 manifest is:

`docs/production/PHASE_28_CONTROLLED_RC_PROMOTION.json`

The verifier is:

`scripts/verify-controlled-rc-promotion.mjs`

The workflow is:

`.github/workflows/controlled-rc-promotion.yml`

The verifier checks:

1. Phase 27 remains `FROZEN`.
2. Candidate identity converges across RC, Global, Android, Beta, Release Closure, RC Evidence Closure and Operator Evidence Control.
3. No protected product path has drifted since the frozen candidate commit.
4. `RELEASE_BLOCKERS.json` contains no open release blocker.
5. Every required RC external evidence gate is `verified`.
6. Repository governance is `verified`.
7. Android and Beta `rcPromoted` projections remain converged.
8. Operator Evidence Control remains the only authority allowed to project the post-promotion `rc-promoted` evidence.

## Report mode

Every PR/push affecting the Phase 28 contract produces a readiness report. Scheduled and manually dispatched report runs remain read-only.

Expected state before the real transfer is approved:

`BLOCKED -> rc.requiredExternalEvidence.paymentRailVerified`

This is an intentional operator boundary, not missing application functionality.

## Promote mode

Actual promotion is available only through an explicit `workflow_dispatch` using:

- mode: `promote`;
- confirmation: `PROMOTE-1.0.0-rc.2`.

Before creating a tag, the workflow re-enforces:

- Phase 28 readiness;
- RC Evidence Closure readiness;
- canonical RC stage closure;
- Global Readiness contract;
- zero protected product drift.

The workflow creates the immutable annotated tag `1.0.0-rc.2` pointing to the frozen candidate commit. If the tag already exists, it succeeds only when the tag resolves to the exact expected candidate SHA.

The workflow then emits a redacted promotion record artifact. It does not directly mutate Android/Beta readiness.

## Post-promotion evidence projection

Tag creation is evidence, not approval.

After the tag exists, the `rc-promoted` evidence must pass through the existing append-only Operator Evidence Control process. Only an approved evidence record may project the same promotion evidence into:

- `ANDROID_PRODUCTION_READINESS.json -> requiredEvidence.rcPromoted`;
- `BETA_CARTAGENA_READINESS.json -> requiredEvidence.rcPromoted`.

This preserves the existing rule that submitted evidence never auto-verifies itself.

## Safety boundaries

Phase 28 does not:

- execute or fabricate a real bank transfer;
- auto-approve financial evidence;
- mutate Railway/provider configuration;
- activate the Cartagena beta;
- enable bookings;
- create or verify veterinarians;
- authorize commercial launch;
- sign the Android AAB;
- publish to Google Play;
- change Data Safety or legal declarations.

## Exit criteria

Phase 28 is complete only when:

1. all RC pre-promotion gates are verified;
2. zero release blockers are open;
3. protected product drift is zero;
4. the immutable `1.0.0-rc.2` tag points to the frozen candidate SHA;
5. the resulting `git-tag` evidence is approved through Operator Evidence Control;
6. Android and Beta readiness both project `rcPromoted=verified` from that approved record.

## Next phase

**Phase 29 — Cartagena Beta Activation**

Phase 29 may then focus on the remaining beta-specific facts: three real operational Cartagena veterinarians, real client cohort, support ownership, legal/privacy review and provider-level rollback drill. RC promotion alone never activates the beta.
