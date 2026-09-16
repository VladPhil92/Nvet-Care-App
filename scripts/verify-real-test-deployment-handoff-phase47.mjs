import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const json = (file) => JSON.parse(read(file))
const failures = []

const phase47 = json('docs/production/PHASE_47_REAL_TEST_DEPLOYMENT_HANDOFF.json')
const phase46 = json(phase47.authoritativeInputs.phase46)
const rc = json(phase47.authoritativeInputs.rcReadiness)
const android = json(phase47.authoritativeInputs.androidReadiness)
const beta = json(phase47.authoritativeInputs.betaReadiness)
const phase28 = json(phase47.authoritativeInputs.phase28)
const phase31 = json(phase47.authoritativeInputs.phase31)
const blockers = json(phase47.authoritativeInputs.releaseBlockers)
const pilotWorkflow = read(phase47.tracks.physicalDevicePilot.workflow)

function require(condition, message) {
  if (!condition) failures.push(message)
}

function summarizeGates(record) {
  const entries = Object.entries(record ?? {})
  const verified = entries.filter(([, value]) => value?.status === 'verified').map(([key]) => key)
  const pending = entries.filter(([, value]) => value?.status !== 'verified').map(([key]) => key)
  return {
    total: entries.length,
    verified: verified.length,
    pending: pending.length,
    percentVerified: entries.length ? Math.round((verified.length / entries.length) * 1000) / 10 : 100,
    verifiedGates: verified,
    pendingGates: pending,
  }
}

function currentPullRequestNumber() {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') return null
  const eventPath = process.env.GITHUB_EVENT_PATH?.trim()
  if (!eventPath) return null

  try {
    const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    const value = Number(payload.pull_request?.number ?? payload.number)
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

require(phase47.phase === 47 && phase47.program === 'real-test-deployment-handoff', 'Phase 47 identity is invalid')
require(phase47.candidate === '1.0.0-rc.2', 'Phase 47 candidate must remain 1.0.0-rc.2')
require(phase47.policy?.featureFreezeRemainsActive === true, 'feature freeze must remain active')
require(phase47.policy?.newProductFeaturesAllowed === false, 'Phase 47 cannot authorize new product features')
require(phase47.policy?.commercialLaunchAuthorized === false, 'Phase 47 cannot authorize commercial launch')
require(phase46.phase === 46, 'Phase 46 must be the immediate engineering prerequisite')
require(phase28.candidateCommitSha === phase47.candidateProductSha, 'Phase 28 promotion target must equal the certified Phase 47 product SHA')
require(phase28.promotion?.targetSha === phase47.candidateProductSha, 'Phase 28 promotion targetSha is stale')

const currentPrNumber = currentPullRequestNumber()
const openBlockers = (blockers.blockers ?? []).filter((entry) => entry.status === 'open')
const currentReleaseBlockerUnderReview = currentPrNumber
  ? openBlockers.find(
      (entry) =>
        entry.prNumber === currentPrNumber &&
        entry.candidate === phase47.candidate &&
        entry.severity === 'release-blocking',
    ) ?? null
  : null
const unresolvedMergedBlockers = openBlockers.filter(
  (entry) => entry !== currentReleaseBlockerUnderReview,
)

// Phase 27 requires the release-blocker entry for the *current* product-changing
// pull request to remain OPEN through its merge. Phase 47, conversely, must
// reject blockers that were already merged and never closed. During a PR run we
// therefore exclude only the matching, candidate-scoped release blocker that is
// currently under review. Push/workflow_dispatch runs have no current PR number,
// so the same entry remains fail-closed after merge until it is explicitly
// resolved by the release-governance flow.
require(
  unresolvedMergedBlockers.length === 0,
  'merged release blockers must be resolved before operator handoff',
)

require(pilotWorkflow.includes('assembleRelease'), 'physical pilot workflow must build a release APK')
require(pilotWorkflow.includes('apksigner') && pilotWorkflow.includes('verify --verbose --print-certs'), 'physical pilot workflow must cryptographically verify the APK')
require(pilotWorkflow.includes(phase47.candidateProductSha), 'physical pilot workflow must pin the certified candidate SHA')
require(pilotWorkflow.includes('backend-production-a476.up.railway.app/api'), 'physical pilot must target the canonical production API')
require(!pilotWorkflow.includes('upload-google-play'), 'physical pilot must remain independent from Play publication')
require(phase31.policy?.automaticProductionPromotion === false, 'Play production promotion must remain manual')
require(phase31.policy?.commercialLaunchAuthorized === false, 'Phase 31 must not authorize commercial launch')

const rcProgress = summarizeGates(rc.requiredExternalEvidence)
const androidProgress = summarizeGates(android.requiredEvidence)
const betaProgress = summarizeGates(beta.requiredEvidence)

const report = {
  schemaVersion: 1,
  phase: 47,
  program: phase47.program,
  candidate: phase47.candidate,
  candidateProductSha: phase47.candidateProductSha,
  state: failures.length === 0 ? 'ENGINEERING_READY_EXTERNAL_ACTION_REQUIRED' : 'ENGINEERING_BLOCKED',
  engineering: {
    status: failures.length === 0 ? 'verified' : 'failed',
    openReleaseBlockers: unresolvedMergedBlockers.length,
    releaseBlockerUnderReview: currentReleaseBlockerUnderReview?.prNumber ?? null,
    failures,
  },
  firstRealDevicePilot: {
    engineeringReady: failures.length === 0,
    distribution: 'signed-apk-controlled-sideload',
    playConsoleRequired: false,
    realPaymentRequiredForInstallSmoke: false,
    minimumDevices: phase47.tracks.physicalDevicePilot.minimumDevices,
    remainingOperatorActions: [
      'confirm production signing secrets and upload certificate are provisioned',
      'dispatch Nvet Real Device Pilot Phase 47',
      'install the signed APK on at least two physical Android devices and retain redacted test evidence',
    ],
  },
  controlledRcPromotion: {
    ...rcProgress,
    nextHardBlocker: rc.requiredExternalEvidence?.paymentRailVerified?.status === 'verified' ? null : 'paymentRailVerified',
    requiredRealWorldFact: 'one controlled real bank transfer with independently retained redacted evidence',
  },
  playInternalTesting: {
    ...androidProgress,
    minimumObservationHours: android.policy?.minInternalTrackObservationHours,
    minimumPhysicalDevices: android.policy?.minPhysicalDevices,
  },
  operationalClosedBeta: {
    ...betaProgress,
    minimumObservationDays: beta.policy?.observationWindowDays,
    minimumVerifiedVets: beta.policy?.minVerifiedVets,
    maximumInitialClients: beta.policy?.maxInitialClients,
  },
  boundaries: {
    publicStoreReleaseAuthorized: false,
    commercialLaunchAuthorized: false,
    externalEvidenceNeverAutoVerified: true,
  },
}

if (process.argv.includes('--write-evidence')) {
  fs.mkdirSync(path.join(root, '.artifacts'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.artifacts/phase47-real-test-deployment-handoff.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
}

console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exit(1)
