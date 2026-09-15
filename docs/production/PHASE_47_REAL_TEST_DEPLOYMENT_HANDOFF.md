# Phase 47 — Real Test Deployment Handoff

Phase 47 does not add product functionality. It converts the certified `1.0.0-rc.2` codebase into an operator-ready path for real Android testing while preserving the Phase 27 feature freeze.

## What this phase closes

1. Resolves the already-merged Phase 46 release-blocker record.
2. Re-anchors controlled RC promotion to the current certified product head `ac38256845ad9228be040e353011b2e7262b5b60`, so historical approved release-blocker changes are no longer misclassified as unapproved product drift.
3. Adds a production-signed APK pilot workflow for controlled sideload testing on real Android hardware without requiring Google Play Console first.
4. Adds a machine-readable handoff report that separates engineering completion from external/operator evidence.

## Three distinct real-world milestones

### A. First real physical-device pilot

The Phase 47 pilot workflow builds a signed release APK from the immutable certified candidate SHA against the canonical production API. It requires release signing material in the protected GitHub `production` environment and explicit manual dispatch. It does **not** activate closed-beta booking, execute a real payment automatically, publish to Google Play, or authorize commercial launch.

Minimum evidence after build: install and smoke-test on at least two physical Android devices, retaining redacted accountable evidence.

### B. Google Play Internal Testing

This remains governed by Phase 31 / Android Production Readiness. Play Console creation, Play App Signing, upload-certificate pinning, privacy-policy publication, Data Safety review, reviewer access, signed AAB evidence and actual Internal-track upload remain external/operator gates. A minimum 24-hour Internal Testing observation window applies.

### C. Operational Cartagena closed beta

This remains governed by Phase 29/30. It requires the controlled real transfer gate, RC promotion, at least three operationally verified Cartagena veterinarians, a real client cohort, accountable support ownership, privacy/terms review and a provider-level rollback drill. The real beta then requires a seven-day observation window before closure.

## Safety boundary

The signed APK pilot is QA distribution only. Public-store rollout and commercial launch remain unauthorized, and no repository automation may synthesize or auto-approve external evidence.
