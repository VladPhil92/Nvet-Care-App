# Phase 27 — Release Candidate Freeze & Production Closure

## Objective

Phase 27 converts the Phase 26-certified Cartagena product baseline into release candidate `1.0.0-rc.2` and stops ordinary feature development. The purpose is to make the release candidate reproducible, regression-resistant and auditable while keeping commercial launch, provider changes and public-store publication explicitly outside machine authority.

The frozen product baseline is the Phase 26 merge on `main`:

- main baseline: `0789ac8d405405b04372fc1ec92e749f7f6a29aa`;
- Phase 26 certified PR head: `99ee55f4a1dea82fac54c167fb156a76a00b90f7`;
- candidate: `1.0.0-rc.2`;
- Android package identity: `com.nvetcare`, versionName `1.0.0-rc.2`, versionCode `10002`;
- market scope: Cartagena de Indias, DANE `13001`;
- channel: closed beta.

`FROZEN` means feature development is paused. It does **not** mean public launch is approved.

## Canonical manifests

Phase 27 adds two machine-readable control-plane files:

- `docs/production/RELEASE_CANDIDATE_FREEZE.json` — frozen baseline, protected product paths, certification domains, package identity, build budgets and authority boundaries;
- `docs/production/RELEASE_BLOCKERS.json` — auditable exception registry for defects that must change product code after the freeze.

`RC_READINESS.json`, `GLOBAL_READINESS.json` and Android's `prerequisiteRcTag` are aligned to `1.0.0-rc.2` and must remain convergent with the Phase 27 manifest.

## Feature-freeze enforcement

The freeze protects product-affecting paths, including:

- root and workspace dependency manifests/lockfile;
- backend application and Prisma sources;
- mobile root entry points (`mobile/App.tsx` and `mobile/index.js`), app/build configuration, application sources, Android and iOS sources;
- dashboard application sources.

A pull request that changes a protected product path after the freeze must satisfy **all** of the following:

1. carry the GitHub label `release-blocker`;
2. update `RELEASE_BLOCKERS.json`;
3. include an entry whose `prNumber` matches the pull request;
4. target `1.0.0-rc.2`;
5. use severity `release-blocking` and status `open` through the merge;
6. include a named owner and a substantive justification;
7. use an auditable GitHub merge commit.

A protected product push that is not the merge commit of the registered blocker PR fails closed. The post-merge `push` run is allowed only when the merge message identifies that PR, the resulting commit has multiple parents, the registry changed in the same diff, and the matching blocker entry is still `open`. This lets the approved exception lifecycle remain green after merge without permitting ordinary product drift.

The enforcement is imported by `scripts/security-convergence-gate.mjs`. Because Security Convergence is already aggregated by the protected `CI Success` job, the freeze is not an optional side check.

## Release candidate certification

`.github/workflows/release-candidate-certification.yml` executes four independent release dimensions.

### 1. Freeze contract

`verify-release-candidate-freeze.mjs` validates:

- candidate and baseline identity;
- Cartagena closed-beta scope;
- RC/GLOBAL/Android candidate convergence;
- Android package identity;
- required release workflows and contracts;
- blocker-registry integrity;
- protected-path drift rules;
- explicit non-authority boundaries.

### 2. Convergence regression

The certification re-runs the repository contracts for:

- security and privacy;
- database recovery;
- verified-veterinarian trust;
- financial production integrity;
- Phase 26 service-quality telemetry;
- Cartagena launch readiness;
- Cartagena launch operations;
- global release readiness;
- Android production readiness.

This does not replace the full CI test suite. It creates a release-specific convergence pass over the same canonical controls.

### 3. Build-performance regression

The candidate rebuilds backend and dashboard from the exact lockfile and applies conservative artifact-size budgets:

| Artifact | Phase 27 budget |
|---|---:|
| Backend `dist` total | <= 12 MiB |
| Dashboard `dist` total | <= 5 MiB |
| Largest dashboard asset | <= 2.5 MiB |

The resulting evidence is uploaded as `.artifacts/release-build-budgets.json`.

These are regression budgets, not a claim about end-user network latency. Runtime operational performance remains grounded in Phase 26 service-quality SLO telemetry, staging E2E and production/runtime evidence.

### 4. Android release package

The certification workflow always builds an unsigned Android `bundleRelease` using the same pinned React Native/Reanimated and Gradle wrapper integrity contract used by CI. Immediately before the build, it loads `androidVersionName` and `androidVersionCode` from the frozen manifest and exports them as `NVET_ANDROID_VERSION_NAME` and `NVET_ANDROID_VERSION_CODE`. The versionName must equal the RC candidate and the versionCode must be greater than the development default. The artifact name also carries both values.

This proves that the generated AAB belongs to the frozen RC identity and can be packaged reproducibly. It does **not** prove Play App Signing, upload certificate ownership, Play Console configuration, internal-track upload or physical-device smoke testing; those external/operator gates remain separate.

## Release blocker lifecycle

The expected steady-state `RELEASE_BLOCKERS.json` is empty.

When a true release-blocking defect appears after the freeze:

1. open the corrective PR;
2. label it `release-blocker`;
3. register the PR in `RELEASE_BLOCKERS.json` with status `open`;
4. make the minimum corrective product change;
5. require CI and Release Candidate Certification to pass;
6. merge using a GitHub merge commit so the protected post-merge push can be tied back to the registered PR;
7. after the merge push certifies successfully, mark the registry entry `resolved` in a non-product follow-up if historical retention is desired.

Feature requests, cleanup, refactors and opportunistic improvements do not qualify as release blockers and should wait until the freeze is lifted.

## Boundaries

Phase 27 never:

- approves missing production evidence;
- changes Railway/provider configuration;
- signs an Android bundle with production credentials;
- uploads to Play Console;
- enables public-store distribution;
- activates a payment rail;
- changes Phase 24/25 launch state automatically;
- treats service-quality health as commercial-launch authorization.

The canonical manifests keep `commercialLaunchAuthorized=false` and `publicStoreReleaseAuthorized=false`.

## Remaining external/operator closure

The release candidate can be engineering-certified while still blocked from commercial release. Existing external gates remain authoritative, including controlled real-funds payment evidence and Android/Play operator evidence where still pending.

Phase 27 therefore distinguishes two statements that must not be conflated:

- **RC engineering certified** — code, contracts, packaging and regression budgets pass;
- **commercial release authorized** — all required external/operator evidence is complete and the responsible operator explicitly promotes the candidate.

Only the first statement is automated here.

## Next phase enabled

After `1.0.0-rc.2` is stable under the freeze, the next logical phase is **Phase 28 — External Release Evidence Closure & Controlled Promotion**. That phase should consume the frozen candidate, close remaining real-world payment/Play/device/legal gates and create an explicit operator promotion record. It must not reopen ordinary feature development.
