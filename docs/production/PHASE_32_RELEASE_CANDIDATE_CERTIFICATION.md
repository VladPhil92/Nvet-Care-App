# Phase 32 — Production Release Candidate Certification & Google Play Internal

## Objective

Phase 32 freezes product code at `733aa8854a2b39af33ebd6df25d2e0f6aa4d1b71` and recertifies the post-PR #310 Android candidate as `1.0.0-rc.3`. The governance implementation was merged in `140463e7034b1c5f558cc5249ce103a574cc6c02`. This phase does not authorize commercial launch or Google Play Production promotion.

## Why rc.3

The previous repository freeze describes `1.0.0-rc.2`, but product-code release blockers and Android/E2E corrections were merged after that baseline. A new immutable release candidate is therefore required; reusing rc.2 would break artifact-to-source traceability.

## Phase 32 gates

1. **Repository static certification — VERIFIED.** Phase 32 Actions run `36455655563` and general CI run `36455655465` completed successfully before PR #311 was merged.
2. **Object-storage backup boundary — BLOCKED.** The canonical verifier now executes from the Phase 32 merge commit, but `BUCKET` resolves empty. The project inventory currently exposes no Railway object-storage bucket. A valid bucket plus credentials must be configured before backup/restore evidence can be accepted.
3. **Fresh encrypted backup — BLOCKED.** `nvet-backup-postgres` deployment `d6e18336-c9aa-4f59-a34b-5ab2eceab503` reported container `SUCCESS`, but no backup artifact/checksum has been independently observed. Container status alone is not evidence that a durable backup exists.
4. **Isolated restore drill — BLOCKED.** Deploy the canonical verifier from `ops/railway/nvet-restore-verify.mjs` to `nvet-restore-verify`, restore only into `nvet-restore-temp-postgres`, validate AES-GCM integrity, backup freshness, `pg_restore`, public schema and critical Nvet tables. The gate closes only after the positive marker is retained.
5. **Provider-level backup evidence — PENDING.** Retain dated evidence for Railway provider backup/snapshot capability. The S3 `pg_dump` path is defense in depth and does not substitute for this gate.
6. **Real payment-rail evidence — PENDING.** Retain redacted evidence of a controlled real transfer. Synthetic application state does not close this gate.
7. **Immutable tag — PENDING.** Only after the external gates above are acceptable, create tag `1.0.0-rc.3` on the exact certified commit.
8. **Signed Android artifact — PENDING.** Run `.github/workflows/release-android.yml` with `version_name=1.0.0-rc.3`, `release_ref=1.0.0-rc.3`, the canonical production `/api` URL and `publish_internal=true`.
9. **Google Play Internal — PENDING.** Retain the signed AAB checksum, release metadata, SBOM, provenance attestations and Play Internal draft evidence.
10. **Physical-device test — PENDING.** Install from Google Play Internal and test auth, account deletion, permissions, navigation, API connectivity, uploads, chat, appointments, transfer flow and failure/recovery paths.

## Railway defects discovered during Phase 32

The original deployment `0aae3bfd-49bf-4a17-a1fb-d59c09c36f4d` was reported by Railway as `SUCCESS`, but its application logs contained `RESTORE DRILL FAILED`. The old restore function constructed `Bun.S3Client` without binding a bucket. Phase 32 moved the canonical source into the repository, added fail-closed validation and corrected the client construction.

A second deployment pass confirmed a separate configuration defect. The canonical verifier was successfully loaded from the merged Phase 32 repository source, then stopped immediately with `BUCKET is required`. Reference variables were wired to `nvet-backup-postgres`, but no usable bucket value resolved; the Railway project inventory also reported no object-storage bucket. The remaining blocker is therefore external storage configuration, not restore-verifier code.

A Railway deployment status alone is not acceptable restore evidence. The required positive marker is:

`[VERIFY] ===== RESTORE DRILL PASSED =====`

The negative marker must terminate with a non-zero process exit code:

`[VERIFY] ===== RESTORE DRILL FAILED =====`

## Required next sequence

Configure a durable S3-compatible/Railway object-storage bucket and valid credentials, produce a fresh encrypted backup with retained artifact metadata/checksum, pass the isolated restore drill, retain provider-level backup evidence and real payment-rail evidence, then create the immutable `1.0.0-rc.3` tag and execute the existing signed Android → Google Play Internal draft workflow.

## Promotion boundary

Phase 32 static CI is certified, but the phase remains `EXTERNAL_EVIDENCE_BLOCKED`. It must never report commercial `GO` by itself. Production Play promotion remains manual and blocked until external evidence is retained and Internal testing is completed.
