# Nvet Care — Railway production recovery runbook

## Status

**Severity:** P0 — production backend deployment

**Canonical backend directory:** `/backend`

The former `/nvet-backend` directory is legacy and must never be configured as the Railway service root.

## Incident evidence

The Railway commit status timeline isolates the deployment regression:

| Commit | Event | Railway backend |
|---|---|---|
| `b89ee6ae` | Identity Phase 1 | SUCCESS |
| `6506ef05` | Identity Phase 2 | SUCCESS |
| `01282642` | Identity Phase 3 | SUCCESS |
| `25a6942e` | Roadmap/status update | SUCCESS |
| `4c330f6f` | PR #26 monorepo consolidation | **FAILURE** |
| `aa9ec071` | PR #30 current baseline | **FAILURE** |

PR #26 removed `nvet-backend/**` and consolidated the active backend into `backend/**`. Railway's isolated-monorepo deployment model requires the service Root Directory to match the surviving project directory. A stale `/nvet-backend` Root Directory therefore becomes invalid immediately after PR #26.

This incident is distinct from, but compounds, the Prisma schema drift previously documented after Identity Phase 1. Recovery must address both deployment source configuration and database/schema compatibility.

## Recovery invariant

The production deployment workflow owns these invariants:

1. Validate lint, build and tests before touching production.
2. Pull the service's real Railway environment variables with `railway run`.
3. Reconcile Prisma with `prisma db push` **without** `--accept-data-loss`.
4. Apply idempotent SQL integrity guards.
5. Repair Railway `source.rootDirectory` to `/backend` before upload.
6. Deploy the canonical backend service.
7. Wait for a Railway terminal deployment status.
8. Require `/api/health/ready` to return healthy readiness.
9. Exercise `/api/auth/login` with a synthetic nonexistent account and reject every 5xx or `PrismaError` response.

If Prisma determines that the current schema requires destructive changes, the workflow must stop. Production data loss must never be accepted automatically.

## Required Railway/GitHub configuration

The GitHub `production` environment must expose:

- `RAILWAY_TOKEN` — Railway project token with access to the production project.
- `RAILWAY_SERVICE_ID` — Nvet Care backend service ID.
- `BACKEND_PROD_URL` — optional; defaults to the current Railway production hostname when absent.

`DATABASE_URL` is intentionally **not duplicated into GitHub** for this workflow. `railway run --service <service> ...` injects the service's own production variables into the predeploy process.

## Canonical Railway service settings

At minimum:

```text
source.rootDirectory = /backend
```

The active package already defines:

```text
build        = nest build
start:prod   = node dist/main
deploy:preflight = node scripts/production-predeploy.mjs
```

The workflow repairs the Root Directory before every deployment so a future repository reorganization cannot silently leave Railway pointing at a deleted path.

## Database synchronization policy

This repository does not have a complete canonical Prisma migration history for every historical schema change. Until that debt is resolved, production uses a conservative reconciliation step:

```bash
npx prisma db push --schema prisma/schema.prisma --skip-generate
```

The command deliberately omits `--accept-data-loss`.

After schema reconciliation, only the known idempotent manual guards are applied automatically:

- `prisma/migrations/manual/booking_integrity_v1.sql`
- `prisma/migrations/manual/live_location_v1.sql`

`resolve_todos.sql` is **not** part of the automatic recovery path because it is not idempotent and must not be replayed blindly.

## Release gates

Production is recovered only when all of the following are true:

```text
GitHub validation                    PASS
Prisma production reconciliation     PASS
Booking integrity guard              PASS
Live-location guard                  PASS
Railway deployment                   SUCCESS
GET /api/health/ready                200 + healthy JSON
POST /api/auth/login smoke           non-5xx, no PrismaError
```

A `401`/`400` response for the synthetic nonexistent login is acceptable; a `500`, `502`, `503` or Prisma error is not.

## Post-recovery application verification

After the backend is green, verify the web path end-to-end:

```text
ctgone.com/nvetcareapp/iniciar-sesion
  → /api/nvetcareapp/auth/login (Next.js BFF)
  → Nvet backend /api/auth/login
  → httpOnly Nvet cookies
  → /nvetcareapp/dashboard
```

Also verify that `CTG_NVETCARE_API_URL` in the `ctg_one_website` production deployment resolves to the recovered backend base URL.

## Follow-up after P0

Once production login is certified, the next product phase is to expose the existing login/dashboard from the Nvet Care landing and expand the CLIENT dashboard into the full web workflow (pets → vet search → booking → tracking/chat → payment/review).
