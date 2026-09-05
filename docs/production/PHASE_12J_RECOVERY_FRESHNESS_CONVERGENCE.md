# Phase 12J — Recovery Freshness Convergence

## Objective

Make application-level recovery evidence a deterministic prerequisite of the automated production-convergence chain without weakening provider-level release gates.

## Automated chain

`CI → {Staging E2E, Recovery Readiness} → Transfer Payment Rail Certification → Web Production Convergence`

Recovery Readiness is triggered by a successful main CI run and checks out the exact CI candidate SHA. Staging E2E runs independently from the same CI candidate. Transfer certification remains downstream of Staging E2E but now waits, with a bounded fail-closed timeout, for a successful `Nvet Recovery Readiness` run whose `head_sha` exactly matches `RC_CANDIDATE_SHA`.

This preserves the existing GitHub Actions `workflow_run` depth: Recovery and Staging are sibling workflows after CI rather than an additional serial workflow level.

## Recovery evidence

The rehearsal uses isolated PostgreSQL only and must prove all of the following:

- canonical migration history rebuilds the schema from an empty database;
- a legacy db-push database can be adopted once into Prisma Migrate;
- staging predeploy does not depend on retained fixture credentials;
- deterministic recovery fixtures can be seeded;
- `pg_dump` produces a non-empty custom archive;
- `pg_restore` restores into an independently created empty database;
- users, pets, appointments, Prisma migration history and the manual SQL checksum ledger survive the restore;
- restored schema reports Prisma migration status successfully.

## Fail-closed boundary

`wait-for-recovery-readiness.mjs` accepts only a completed successful recovery run on `main` with an exact SHA match. A failed rehearsal fails payment certification immediately. A missing or running rehearsal is polled only within a bounded timeout; timeout is failure.

## External evidence remains separate

This phase does **not** promote or fabricate any of the following:

- Railway provider automatic backup configuration;
- Railway provider-level restore drill;
- controlled real-funds bank transfer evidence.

Repository-level `pg_dump` / `pg_restore` is application recovery evidence, not provider restore evidence. RC/commercial promotion remains fail-closed until the independent external evidence gates are verified.
