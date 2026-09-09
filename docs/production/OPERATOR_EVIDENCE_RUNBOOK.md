# Nvet Care — Operator Evidence Control Plane

## Purpose

This control plane is the repository system of record for external/provider/operator evidence that software cannot truthfully self-certify. It does not create provider backups, execute a real bank transfer, configure Google Play, perform physical-device testing, or protect `main`. It only accepts redacted evidence of those actions and projects approved evidence into the existing RC, Android, beta and global readiness manifests.

## Safety model

- Evidence records are append-only. Existing records must never be edited, renamed or deleted.
- A submission is never equivalent to verification. Every gate requires a separate approval event.
- High-risk gates require an approver different from the submitter.
- Every record is pinned to `1.0.0-rc.1` and to a full 40-character candidate SHA.
- Google Play/Android evidence cannot become valid before `rc-promoted` exists, and downstream Android evidence must use the same promoted RC SHA.
- Evidence freshness is evaluated per gate. Expired evidence remains historical but no longer satisfies readiness.
- References must be redacted. Never paste tokens, passwords, service-account JSON, private keys, signed URLs, bank account credentials, OTPs, or raw personal data.
- Readiness manifests are deterministic projections of approved evidence. Directly changing a manual gate from `pending` to `verified` is rejected by the contract workflow unless the append-only ledger supports it.

## Workflow

Use **Actions → Operator Evidence Control**.

### Submit

Choose `submit` and provide:

1. `gate_id` from `docs/production/OPERATOR_EVIDENCE_CONTROL.json`.
2. `candidate_sha`: full 40-character SHA the evidence applies to.
3. `observed_at`: ISO-8601 timestamp of the real-world observation.
4. `evidence_kind`: one of the kinds allowed for that gate.
5. `evidence_reference`: a redacted reference, public URL, GitHub run/issue, checksum, provider reference or non-secret document identifier.
6. Optional non-secret note.

The workflow creates a dedicated branch and PR containing one new submission record. It does not verify the gate.

### Approve

After the submission PR is merged, choose `approve` and provide its `submission_id` (`gateId:runId`). The workflow creates a separate approval record and deterministically synchronizes RC/Android/beta/global readiness manifests in the approval PR.

For `provider-restore-drill`, `real-transfer-rail`, `signed-aab`, `physical-device-smoke`, and `rollback-drill`, GitHub actor identity must differ from the submitter.

### Report

Choose `report` to generate `nvet-operator-evidence-status` as a GitHub Actions artifact. The report is read-only and contains the current valid/pending state of every registered manual gate.

## Registered closure gates

The registry covers provider backup and restore evidence, real transfer evidence, RC promotion, Google Play application/signing/certificate/compliance handoff, privacy publication, Data Safety review, reviewer access, signed AAB, internal track, physical device smoke, Cartagena beta coverage/cohort/support/legal/rollback evidence, and final `main` branch protection.

## Final repository protection

`main-branch-protection` intentionally remains an operator/admin gate. Configure GitHub rules so changes require pull requests, require the aggregated `CI Success` status, prevent direct pushes, and apply the rule to administrators/maintainers where the repository plan permits it. Only after configuration should evidence be submitted and approved through this control plane.
