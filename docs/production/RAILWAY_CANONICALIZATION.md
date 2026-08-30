# Railway canonicalization runbook — Nvet Care backend

## Objective

Move the production Railway service away from the temporary `/nvet-backend` compatibility bridge and onto the canonical npm-workspace backend without interrupting production.

## Canonical repository model

This repository is a shared npm-workspace monorepo. The canonical dependency lockfile is `/package-lock.json`, so Railway should operate from repository root `/` and target the `backend` workspace explicitly.

Target Railway service settings:

- Source repository: `VladPhil92/Nvet-Care-App`
- Branch: `main`
- Root Directory: `/`
- Builder: `RAILPACK`
- Build Command: `npm run build --workspace backend`
- Pre-deploy Command: `npm run deploy:preflight --workspace backend`
- Start Command: `npm run railway:start --workspace backend`
- Healthcheck Path: `/api/health/ready`
- Healthcheck Timeout: `300`
- Restart policy: `ON_FAILURE`
- Restart max retries: `5`
- Watch paths:
  - `/backend/**`
  - `/package.json`
  - `/package-lock.json`
  - `/railway.json` while legacy Config as Code remains active

`backend/scripts/railway-runtime-smoke.mjs` starts the compiled NestJS service, waits for readiness, then executes a synthetic login that must return HTTP 401. Any 5xx, Prisma failure, readiness failure, or early process exit makes the runtime fail closed.

## Why Root Directory is `/`, not `/backend`

`backend` is an npm workspace and the repository intentionally has one canonical lockfile at the monorepo root. Keeping Railway at `/` preserves deterministic workspace dependency resolution while build/start commands target only `backend`.

## Safe cutover sequence

### Phase A — preparation in GitHub

1. Merge the canonical backend runtime smoke script and `railway:start` package script.
2. Make the old GitHub Actions Railway workflow manual-only so native Railway GitHub autodeploy remains the single production deployment owner.
3. Keep `/nvet-backend` and the current root `railway.json` untouched during this phase.
4. Confirm Railway still reports SUCCESS after the preparation merge.

### Phase B — operator changes only Root Directory

Change Railway `Root Directory` from `/nvet-backend` to `/` and deploy the staged change.

Do **not** change builder, commands, healthcheck, or remove the bridge in the same step.

Why this is safe: the existing `railway.json` still points at `/nvet-backend/Dockerfile`, and repository root `/` contains that compatibility bridge. A successful deployment proves the source-root drift is removed before the build mechanism is changed.

Acceptance criteria:

- Railway deployment reaches SUCCESS.
- Existing healthcheck remains green.
- Existing runtime auth smoke remains green.

Rollback: restore Root Directory to `/nvet-backend` if this isolated change fails.

### Phase C — switch build/runtime to canonical workspace

After Phase B is verified, update root `railway.json` to the canonical Railpack contract:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "RAILPACK",
    "buildCommand": "npm run build --workspace backend",
    "watchPatterns": [
      "/backend/**",
      "/package.json",
      "/package-lock.json",
      "/railway.json"
    ]
  },
  "deploy": {
    "preDeployCommand": [
      "npm run deploy:preflight --workspace backend"
    ],
    "startCommand": "npm run railway:start --workspace backend",
    "healthcheckPath": "/api/health/ready",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

Merge only after Phase B is green. Railway native GitHub autodeploy will then exercise the canonical workspace path.

Acceptance criteria:

- Railpack build SUCCESS.
- Prisma predeploy SUCCESS.
- `/api/health/ready` SUCCESS.
- runtime synthetic login returns exact HTTP 401.
- Railway commit status SUCCESS.

Rollback: revert the `railway.json` canonicalization commit. Root `/` can remain in place because the legacy bridge exists within the root source.

### Phase D — remove compatibility bridge

Only after at least one canonical Railpack deployment is SUCCESS:

- remove `/nvet-backend/**`;
- remove the legacy Docker bridge CI job;
- remove bridge-specific watch paths and documentation;
- verify another Railway deployment from canonical workspace.

### Phase E — migrate off deprecated Config as Code

Railway legacy `railway.json` / `railway.toml` Config as Code is deprecated and has a 2026-12-01 cutoff for existing services.

Use an authenticated Railway CLI session to import the live project into Infrastructure as Code:

```bash
railway login
railway link
railway config pull
railway config plan
```

Review the generated `.railway/railway.ts` before applying it. Never hand-invent project/service IDs or secret values in IaC.

Once the generated IaC matches the verified live service:

```bash
railway config apply
```

Then remove the deprecated `railway.json` only after a deployment and configuration plan confirm parity.

## Deployment ownership

Production deployment owner: Railway native GitHub autodeploy.

`.github/workflows/deploy-backend.yml` is recovery/inspection only and must remain `workflow_dispatch`-only. It must not deploy automatically on every push to `main`.

## P0 invariants

The following may not be weakened during Railway work:

1. Production schema reconciliation must fail closed and must never use `--accept-data-loss`.
2. Healthcheck must remain `/api/health/ready`.
3. Production startup must run the runtime auth smoke gate.
4. Synthetic login must return HTTP 401, never 5xx or Prisma/database errors.
5. Only one automated production deployment owner may exist.
