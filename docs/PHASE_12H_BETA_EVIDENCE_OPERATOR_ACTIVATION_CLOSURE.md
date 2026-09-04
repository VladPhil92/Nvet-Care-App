# Phase 12H — Beta Evidence & Operator Activation Closure

## Objective

Phase 12H converts the remaining Cartagena closed-beta evidence obligations into an enforceable release and activation boundary. It does **not** manufacture provider, financial, legal, veterinary, cohort, support, or rollback evidence. Instead, it makes those external facts impossible to bypass through repository configuration alone.

## Canonical sources

- `docs/production/RC_READINESS.json` remains the canonical Release Candidate external-evidence manifest.
- `docs/production/BETA_CARTAGENA_READINESS.json` remains the canonical Cartagena Beta evidence manifest.
- `docs/production/BETA_OPERATOR_ACTIVATION_CLOSURE.json` is the Phase 12H authorization closure manifest. It must declare exactly the blockers derived from the canonical evidence manifests.

## Enforcement

`scripts/verify-beta-operator-activation-closure.mjs` enforces the following invariants:

1. The Beta prerequisite tag and closure candidate must match the RC candidate exactly.
2. Every required gate must exist and have only `pending` or `verified` state.
3. A `verified` gate must include a substantive evidence reference.
4. A `pending` gate cannot contain an evidence reference that has not been atomically promoted.
5. RC evidence inherited by Beta must have identical status and evidence in both manifests.
6. The Phase 12H declared blocker set must exactly equal the currently pending Beta gate set.
7. RC promotion authorization must remain false while any RC external evidence gate is pending.
8. Provider activation and commercial launch authorization must remain false while any Beta evidence gate is pending.
9. An attempted `1.0.0-rc.*` tag push fails certification while RC evidence remains incomplete.

The GitHub Actions workflow `.github/workflows/beta-operator-activation-closure.yml` executes this contract on relevant pull requests, `main`, manual certification, and RC tag promotion attempts.

## Current closure state — 2026-09-04

The current state is intentionally **BLOCKED**. `productionAlertingVerified` is the only verified Beta evidence gate. The following items remain external closure actions:

- promote the exact `1.0.0-rc.1` candidate after all RC evidence closes;
- configure and verify provider-level automatic production backups;
- execute and retain a provider-level non-destructive restore drill;
- retain controlled real payment-rail funds-movement evidence;
- verify at least three active approved veterinarians serving Cartagena;
- configure the real CLIENT beta cohort through the append-only control plane;
- confirm a named support owner and monitored support route;
- retain responsible legal/privacy review of the versioned beta documents;
- execute and retain the provider-level booking kill-switch rollback drill.

## Promotion procedure

Each external gate is closed through a separate evidence-bearing change. The operator must update the canonical source manifest with `status: verified` and a redacted evidence reference. If the gate is inherited from RC, the RC and Beta manifests must be updated atomically. The Phase 12H closure manifest must then remove that gate from `declaredBlockers` in the same change.

Only after the RC blocker set reaches zero may `rcPromotionAuthorized` become true and the exact candidate tag be promoted. Only after the complete Beta blocker set reaches zero may operator/provider activation proceed. Commercial launch remains a separate explicit decision and is never implied by machine readiness, evidence approval, or an active authorization lease.

## Security boundary

Phase 12H deliberately preserves the existing fail-closed architecture:

- evidence approval does not mutate provider configuration;
- operator authorization does not mutate provider configuration;
- runtime environment flags do not constitute external evidence;
- repository CI success does not constitute human, legal, financial, veterinary, or provider drill evidence;
- machine readiness never authorizes a commercial launch.

## Definition of done

Phase 12H infrastructure is complete when the closure manifest, verifier, and CI gate are merged and green. The **operational closure** remains pending until every external blocker is supported by real evidence. This distinction prevents software completion from being confused with market-launch authorization.
