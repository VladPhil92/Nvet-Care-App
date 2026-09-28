# Phase 32 — Production Release Candidate Certification & Google Play Internal

## Objective

Phase 32 freezes product code at `733aa8854a2b39af33ebd6df25d2e0f6aa4d1b71` and recertifies the post-PR #310 Android candidate as `1.0.0-rc.3`. This phase does not authorize commercial launch or Google Play Production promotion.

## Why rc.3

The previous repository freeze describes `1.0.0-rc.2`, but product-code release blockers and Android/E2E corrections were merged after that baseline. A new immutable release candidate is therefore required; reusing rc.2 would break artifact-to-source traceability.

## Phase 32 gates

1. **Repository static certification** — the Phase 32 verifier must pass and confirm no product-code path changed after the selected baseline.
2. **Fresh encrypted backup** — produce a fresh encrypted production backup and retain its timestamp/checksum evidence.
3. **Isolated restore drill** — deploy the canonical verifier from `ops/railway/nvet-restore-verify.mjs` to `nvet-restore-verify`, restore only into `nvet-restore-temp-postgres`, validate AES-GCM integrity, backup freshness, `pg_restore`, public schema and critical Nvet tables.
4. **Provider-level backup evidence** — retain dated evidence for Railway provider backup/snapshot capability. The S3 `pg_dump` path is defense in depth and does not substitute for this gate.
5. **Real payment-rail evidence** — retain redacted evidence of a controlled real transfer. Synthetic application state does not close this gate.
6. **Immutable tag** — after the external gates above are acceptable, create tag `1.0.0-rc.3` on the exact certified commit.
7. **Signed Android artifact** — run `.github/workflows/release-android.yml` with `version_name=1.0.0-rc.3`, `release_ref=1.0.0-rc.3`, the canonical production `/api` URL and `publish_internal=true`.
8. **Google Play Internal** — retain the signed AAB checksum, release metadata, SBOM, provenance attestations and Play Internal draft evidence.
9. **Physical-device test** — install from Google Play Internal and test auth, account deletion, permissions, navigation, API connectivity, uploads, chat, appointments, transfer flow and failure/recovery paths.

## Railway defect discovered during Phase 32

Deployment `0aae3bfd-49bf-4a17-a1fb-d59c09c36f4d` was reported by Railway as `SUCCESS`, but its application logs contain `RESTORE DRILL FAILED`. The restore function constructed `Bun.S3Client` without the bucket, so Bun rejected S3 access before any restore occurred. Phase 32 makes the verifier fail closed and moves the canonical source into the repository.

A Railway deployment status alone is therefore not acceptable restore evidence. The required positive marker is:

`[VERIFY] ===== RESTORE DRILL PASSED =====`

The negative marker must terminate with a non-zero process exit code:

`[VERIFY] ===== RESTORE DRILL FAILED =====`

## Promotion boundary

Phase 32 static CI may report `READY_FOR_EXTERNAL_EVIDENCE`. It must never report commercial `GO` by itself. Production Play promotion remains manual and blocked until external evidence is retained and Internal testing is completed.
