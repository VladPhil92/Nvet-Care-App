# Phase 11A — Web Production Convergence

**Status:** active release-certification layer for the canonical web product.

## Objective

Move Nvet Care from “deployed components” to a reproducible technical statement that the canonical web path is converged:

`ctgone.com/nvetcareapp → CTG One BFF/identity → Nvet backend → PostgreSQL`

This phase does not claim commercial readiness. Provider/operator evidence remains separate and mandatory for Release Candidate promotion.

## Canonical surfaces

- Web: `https://ctgone.com/nvetcareapp`
- CTG One federation health: `https://ctgone.com/api/nvetcareapp/health`
- Nvet production backend readiness: `https://backend-production-a476.up.railway.app/api/health/ready`
- Isolated staging: supplied through the GitHub `staging` environment as `E2E_API_URL`

## Convergence gate

`.github/workflows/web-production-convergence.yml` is the canonical non-destructive convergence gate. It runs periodically and can be dispatched manually from `main`.

The gate verifies:

1. staging configuration is sourced from environment secrets;
2. staging readiness is healthy;
3. dedicated CLIENT and VET fixture authentication succeeds;
4. emergency-vet discovery succeeds against the seeded isolated staging fixture;
5. the production backend readiness contract is healthy now;
6. `ctgone.com` can reach the Nvet production backend now;
7. the exact candidate SHA has successful CI and Railway contract evidence;
8. production/staging/CTG One canary evidence is fresh according to `RC_READINESS.json`.

## Machine gates vs operator evidence

`scripts/verify-release-candidate-readiness.mjs` supports two runtime modes:

```bash
# Enforce only machine-verifiable technical gates.
RC_ENFORCE=true node scripts/verify-release-candidate-readiness.mjs --runtime --machine-only

# Produce the full RC report, including provider/operator evidence.
RC_ENFORCE=false node scripts/verify-release-candidate-readiness.mjs --runtime
```

The machine-only mode exists so automation can fail for a real technical regression without falsely treating a manual provider checklist as a code failure.

The full RC promotion still requires the external evidence declared in `docs/production/RC_READINESS.json`:

- provider-level production backups;
- dated non-destructive restore drill;
- production alerting/escalation path;
- at least one intended payment rail verified end-to-end.

## Credential policy

No staging fixture password or provider credential may be committed in workflow YAML, source code or documentation.

The canonical staging gate reads:

- `E2E_API_URL`
- `E2E_CLIENT_EMAIL`
- `E2E_CLIENT_PASSWORD`
- `E2E_VET_EMAIL`
- `E2E_VET_PASSWORD`

from the GitHub `staging` environment.

Temporary one-shot staging workflows used during initial provisioning are retired after this phase. Any credential that has previously appeared in repository history must be rotated before RC promotion, even when it only protected a non-production fixture account.

## Exit criteria

Phase 11A is technically complete when:

1. `Web Production Convergence` succeeds on `main`;
2. CI and Railway contract are green on the same candidate SHA;
3. production backend and CTG One access canaries are fresh;
4. isolated staging E2E evidence is fresh;
5. no active workflow contains hard-coded staging credentials.

This does **not** by itself promote `1.0.0-rc.1`. Promotion remains blocked until the external evidence contract is also verified.
