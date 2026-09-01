# Phase 11C — RC Evidence Closure & Controlled Promotion

## Objective

Close machine-verifiable operational evidence without weakening fail-closed staging, payment, or provider recovery requirements. Promotion of `1.0.0-rc.1` remains blocked until every external evidence item in `docs/production/RC_READINESS.json` is explicitly verified.

## Changes in this phase

### 1. Alert drill semantics

`Nvet Production Backend Health Canary` now distinguishes three cases:

- real healthy production probe → workflow succeeds and may close a real open readiness incident;
- real unhealthy production probe → workflow fails and creates/updates the real `[ALERT]` incident;
- synthetic drill → the readiness probe fails intentionally, the workflow remains certifiable, and a dedicated `[DRILL]` issue is created and closed after the incident API path succeeds.

A change to the canary workflow on `main` automatically performs the isolated synthetic drill. This gives the alert path evidence without mutating production and without reusing a real production incident.

### 2. Recovery freshness

The RC runtime auditor now treats a recent successful `Nvet Recovery Readiness` workflow as machine evidence that the application-level PostgreSQL recovery procedure is still reproducible. The freshness window is 168 hours.

This evidence proves the repository-owned `pg_dump` → empty database → `pg_restore` → integrity-check procedure. It does not replace provider-level automatic backup configuration or a provider restore drill.

### 3. Alert evidence freshness

A successful synthetic push drill is tracked separately from ordinary scheduled production health canaries. The full RC audit requires a recent isolated alert drill within the configured 720-hour evidence window.

Scheduled and ordinary manual canaries continue to be the only runs accepted as real production health freshness evidence.

## Fail-closed boundaries retained

The following conditions remain intentionally blocking:

1. isolated staging credentials are absent or stale;
2. Railway staging cannot seed securely with dedicated E2E identities;
3. provider-level production backup evidence has not been retained;
4. provider-level restore drill evidence has not been retained;
5. no real MVP payment rail has passed end-to-end evidence;
6. PSE remains sandbox/mock;
7. CTG payment remains unavailable until the canonical wallet ledger exists.

No fallback fixture password, mock PSE redirect, or unverifiable external evidence may be promoted to production readiness.

## Controlled promotion sequence

1. Merge this phase only after CI, Railway Contract and RC contract checks are green.
2. Require the automatic synthetic alert drill on `main` to finish green and leave a closed `[DRILL]` issue as evidence.
3. Rotate/configure staging E2E secrets in GitHub and Railway and obtain a green `Web Production Convergence` run.
4. Verify provider production backups and execute a dated provider restore drill.
5. Execute one real end-to-end MVP payment rail and retain transaction evidence.
6. Update `RC_READINESS.json` with concrete evidence references only after the corresponding proof exists.
7. Run the full RC audit with enforcement before promotion.

## Promotion rule

`1.0.0-rc.1` is promotable only when both conditions are true:

- all machine gates are green and fresh;
- all entries under `requiredExternalEvidence` are `verified` with concrete evidence references.
