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
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath || !fs.existsSync(eventPath)) return null
  try {
    const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    const value = Number(payload.pull_request?.number ?? payload.number)
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

const currentPrNumber = currentPullRequestNumber()
const openBlockers = (blockers.blockers ?? []).filter((entry) => entry.status === 'open')
// A release-blocker PR is required by Phase 27 to remain open in the registry
// through the merge that changes protected product code. During that PR's own
// validation it is not yet a *merged* blocker, so Phase 47 must not report a
// false engineering failure. On push to main there is no current PR exclusion,
// and the just-merged blocker must be resolved by the governance follow-up.
const mergedOpenBlockers = openBlockers.filter(
  (entry) => entry.prNumber !== currentPrNumber,
)

require(phase47.phase === 47 && phase47.program === 'real-test-deployment-handoff', 'Phase 47 identity is invalid')
require(phase47.candidate === '1.0.0-rc.2', 'Phase 47 candidate must remain 1.0.0-rc.2')
require(phase47.policy?.featureFreezeRemainsActive === true, 'feature freeze must remain active')
require(phase47.policy?.newProductFeaturesAllowed === false, 'Phase 47 cannot authorize new product features')
require(phase47.policy?.commercialLaunchAuthorized === false, 'Phase 47 cannot authorize commercial launch')
require(phase46.phase === 46, 'Phase 46 must be the immediate engineering prerequisite')
require(phase28.candidateCommitSha === phase47.candidateProductSha, 'Phase 28 promotion target must equal the certified Phase 47 product SHA')
require(phase28.promotion?.targetSha === phase47.candidateProductSha, 'Phase 28 promotion targetSha is stale')
require(mergedOpenBlockers.length === 0, 'merged release blockers must be resolved before operator handoff')
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
    openReleaseBlockers: openBlockers.length,
    mergedOpenReleaseBlockers: mergedOpenBlockers.length,
    currentPullRequestBlocker:
      currentPrNumber && openBlockers.some((entry) => entry.prNumber === currentPrNumber)
        ? currentPrNumber
        : null,
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
