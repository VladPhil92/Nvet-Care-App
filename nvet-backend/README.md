# `nvet-backend/` — temporary Railway compatibility bridge

> **Not a backend source tree. Do not develop product code here.**

The canonical Nvet Care backend is `../backend/`.

This directory exists only to recover the production Railway service while its persisted Root Directory still points to the legacy `/nvet-backend` path removed by PR #26.

## How the bridge works

Railway's GitHub-triggered build provides `RAILWAY_GIT_COMMIT_SHA`. The Dockerfile:

1. requires that exact SHA;
2. downloads the public repository archive for that SHA;
3. builds the canonical `backend/` from the same immutable commit;
4. starts through the compatibility `package.json`;
5. executes the canonical `deploy:preflight` before NestJS starts.

There is therefore still only one backend implementation: `backend/`.

The production preflight is fail-closed. It runs Prisma schema reconciliation without `--accept-data-loss` and refuses to start if safe reconciliation cannot complete.

## Removal criterion

Delete this directory after all of the following are true:

- Railway `source.rootDirectory` is permanently set to `/backend`;
- a native Railway deployment from `/backend` reaches `SUCCESS`;
- `/api/health/ready` is healthy;
- `/api/auth/login` no longer returns 5xx/Prisma errors;
- the GitHub production environment has a valid `RAILWAY_TOKEN` if the GitHub-driven deploy workflow is retained.

Until then, this directory is a P0 deployment compatibility layer and must remain minimal.
