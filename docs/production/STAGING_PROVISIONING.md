# Nvet Care — Isolated Staging Provisioning

This runbook defines the one-time bootstrap and recurring validation path for the permanent Nvet Care staging environment used by Android Detox.

## Goal

Staging must be physically separated from production. It is not a production clone and it must never reuse the production database or production credentials.

The canonical topology is:

```text
GitHub Actions
  |
  +-- Provision Isolated Staging (one time)
  |     |
  |     +-- Railway environment: staging
  |           |
  |           +-- nvet-staging-backend
  |           |     +-- source: VladPhil92/Nvet-Care-App @ main
  |           |     +-- DATABASE_URL -> staging Postgres private URL
  |           |     +-- generated staging-only JWT/2FA/session secrets
  |           |
  |           +-- Postgres
  |                 +-- private URL for backend
  |                 +-- TCP proxy only for GitHub CI maintenance
  |
  +-- Staging E2E Seed & Preflight (recurring maintenance)
  |
  +-- Mobile E2E -> Android -> Detox 01 -> 02 -> 03
```

## Safety invariants

1. The bootstrap creates an **empty** Railway environment named `staging`; it does not duplicate `production`.
2. The workflow refuses to continue if `staging` already exists. It is a one-time bootstrap, not an infrastructure reconciler.
3. The staging backend receives fresh JWT, refresh, 2FA and session secrets generated during bootstrap. No production secret is copied.
4. `DATABASE_URL` inside the backend is a Railway reference to the PostgreSQL service in the same `staging` environment.
5. PostgreSQL public access exists only to let GitHub Actions run schema/seed maintenance against this dedicated synthetic-data database.
6. The E2E seed is still fail-closed behind `NVET_ALLOW_E2E_SEED=true` and `NVET_SEED_TARGET=staging`.
7. CTG One identity exchange stays disabled during this phase.
8. PSE/CTG production rails are not enabled merely to satisfy tests. The current E2E client flow uses `TRANSFER`.
9. The workflow never deletes or updates an existing Railway environment.
10. Issue #55 stays open until the real environment passes preflight and Android Detox 01→02→03.

## Prerequisite: Railway account/workspace token

Creating an environment is an account/workspace-level Railway operation. Add the following GitHub repository secret before running the bootstrap:

```text
RAILWAY_API_TOKEN
```

Use an account/workspace token that has access to the existing Railway project. Do not define `RAILWAY_TOKEN` in the same workflow context; Railway CLI treats the two authentication variables as mutually exclusive.

The Railway project ID is supplied as a workflow input instead of being committed to source.

## One-time bootstrap

From GitHub Actions, run:

```text
Provision Isolated Staging
```

Inputs:

```text
project_id     = Railway project ID that hosts Nvet Care
frontend_url   = https://ctgone.com  (default)
confirm        = provision-staging
```

The workflow performs these gates in order:

1. authenticates Railway CLI;
2. verifies that no `staging` environment already exists;
3. creates an empty `staging` environment;
4. provisions a fresh PostgreSQL service;
5. creates `nvet-staging-backend`;
6. sets staging-only runtime variables;
7. connects the backend service to `VladPhil92/Nvet-Care-App` on `main`;
8. creates a public HTTPS Railway domain for the staging backend;
9. creates a TCP proxy for the staging PostgreSQL service;
10. deploys the canonical root `Dockerfile.railway` / `railway.json` contract;
11. waits for `/api/health/ready`;
12. re-applies the fail-closed Prisma/manual SQL predeploy from CI;
13. seeds only deterministic E2E fixtures;
14. runs `mobile/e2e/preflight.mjs` and requires:
    - readiness;
    - CLIENT login + access token + role;
    - VET login + access token + role;
    - `Emergencias + Disponible ahora` search returning fixture `NVET-E2E-0001`.

The job summary prints only the public staging API URL. Database credentials are masked and never emitted deliberately.

## GitHub `staging` environment handoff

After the bootstrap is green, configure the existing GitHub Actions environment named `staging` for the recurring workflows.

Required secrets:

```text
STAGING_DATABASE_URL
E2E_API_URL
E2E_CLIENT_EMAIL
E2E_CLIENT_PASSWORD
E2E_VET_EMAIL
E2E_VET_PASSWORD
GOOGLE_MAPS_ANDROID_API_KEY
```

Use these values:

```text
STAGING_DATABASE_URL = Railway Postgres -> DATABASE_PUBLIC_URL
E2E_API_URL          = API URL printed by the bootstrap, ending in /api
E2E_CLIENT_EMAIL     = cliente@nvetcare.test
E2E_CLIENT_PASSWORD  = TestClient123!
E2E_VET_EMAIL        = vet@nvetcare.test
E2E_VET_PASSWORD     = TestVet123!
```

`GOOGLE_MAPS_ANDROID_API_KEY` must be a key intentionally authorized for the staging Android build. Do not paste a production-only key into documentation or repository source.

The four fixture credentials above are synthetic test identities already defined by the deterministic seed. They provide no production access and must never be reused by real accounts.

## Recurring staging maintenance gate

Run:

```text
Staging E2E Seed & Preflight
confirm = seed-staging
```

That workflow must remain green before a full Detox certification. It verifies the DB target shape, applies the schema contract, resets only the dedicated E2E fixture records, and certifies readiness/auth/emergency discovery.

## Android certification gate

After the staging maintenance gate is green, run:

```text
Mobile E2E
platform      = android
record_videos = true   # recommended for first certification
```

The required deterministic order is:

```text
01-login-search-book-pay
  -> CLIENT login
  -> real vet search
  -> booking
  -> TRANSFER

02-vet-receives-appointment
  -> VET login
  -> PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED
  -> mandatory clinical notes

03-chat-reconnect
  -> canonical appointment chat
  -> reconnect behavior
```

The first failing functional assertion becomes the next smallest P0/P1 fix. Do not bypass or weaken the assertion to make the suite green.

## Exit criteria for issue #55 / staging phase

The phase is complete only when all of the following are evidenced by real runs:

- [ ] Railway `staging` exists and is separate from production.
- [ ] Staging PostgreSQL is a separate service/data store.
- [ ] Staging backend deploys from the current `main` contract.
- [ ] `GET /api/health/ready` returns 200.
- [ ] `Staging E2E Seed & Preflight` is green.
- [ ] `Mobile E2E` Android reaches the emulator.
- [ ] Detox flow 01 passes.
- [ ] Detox flow 02 passes.
- [ ] Detox flow 03 passes.
- [ ] No production database, production fixture, or production credential was used to obtain the result.

Only then should #55 be closed and the release roadmap move from staging/E2E preparation to RC hardening.

## After the first successful Detox run

The next release gates are:

1. signed Android AAB using the release workflow;
2. physical-device smoke test against staging;
3. branch protection / required `CI Success` on `main`;
4. alerting and backup/restore verification;
5. RC1 with zero open P0/P1 defects;
6. controlled Cartagena beta;
7. Google Play production track.
