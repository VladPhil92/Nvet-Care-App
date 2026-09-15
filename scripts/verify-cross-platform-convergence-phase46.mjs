import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const failures = []

function requireText(file, expected, label = expected) {
  const source = read(file)
  if (!source.includes(expected)) {
    failures.push(`${file}: missing ${label}`)
  }
}

function topLevelQueryRoots(file) {
  const source = read(file)
  const qkStart = source.indexOf('export const qk = {')
  const qkEnd = source.indexOf('} as const', qkStart)
  const block = source.slice(qkStart, qkEnd)
  return new Set(
    [...block.matchAll(/^  ([a-zA-Z][a-zA-Z0-9]*): \{/gm)].map((match) => match[1]),
  )
}

const manifest = JSON.parse(
  read('docs/production/PHASE_46_CROSS_PLATFORM_CONVERGENCE.json'),
)

if (manifest.phase !== 46 || manifest.program !== 'cross-platform-convergence') {
  failures.push('Phase 46 manifest identity is invalid')
}
if (manifest.releaseBoundary?.newProductFeaturesAllowed !== false) {
  failures.push('Phase 46 must not authorize new product functionality')
}
if (manifest.releaseBoundary?.featureFreezeRemainsActive !== true) {
  failures.push('Phase 46 must preserve the release-candidate feature freeze')
}

const mobileRoots = topLevelQueryRoots('mobile/src/lib/queryKeys.ts')
const dashboardRoots = topLevelQueryRoots('dashboard/src/lib/queryKeys.ts')
for (const rootKey of manifest.sharedCanonicalQueryRoots ?? []) {
  if (!mobileRoots.has(rootKey)) failures.push(`mobile query keys missing shared root: ${rootKey}`)
  if (!dashboardRoots.has(rootKey)) failures.push(`dashboard query keys missing shared root: ${rootKey}`)
}

for (const file of [
  'mobile/src/stores/useAuthStore.ts',
  'dashboard/src/stores/useAuthStore.ts',
]) {
  requireText(file, 'adoptSessionCacheOwner', 'session cache ownership adoption')
  requireText(file, 'clearSessionCache', 'session cache cleanup')
}

requireText(
  'mobile/src/lib/sessionCache.ts',
  "MOBILE_SESSION_OWNER_STORAGE_KEY = 'nvet-care-mobile-session-owner-v1'",
  'mobile per-user cache owner',
)
requireText('mobile/src/lib/sessionCache.ts', 'queryClient.clear()', 'mobile query cache purge')
requireText('mobile/src/lib/sessionCache.ts', 'disconnectSocket()', 'mobile socket teardown')
requireText(
  'mobile/src/lib/sessionCache.ts',
  'clearAllPendingPaymentRecovery()',
  'mobile payment-recovery purge',
)
requireText(
  'mobile/src/lib/sessionCache.ts',
  'adoptAuthenticatedUser',
  'canonical authenticated-user adoption helper',
)
requireText(
  'mobile/src/services/auth.service.ts',
  'await adoptAuthenticatedUser(data.user)',
  'all successful mobile auth flows adopting canonical client session',
)
requireText(
  'mobile/src/services/auth.service.ts',
  'await clearSessionCache()',
  'all mobile auth termination flows clearing client session state',
)
requireText(
  'mobile/src/lib/bookingPaymentRecovery.ts',
  'clearAllPendingPaymentRecovery',
  'payment recovery session-boundary API',
)
requireText(
  'mobile/src/lib/queryClient.ts',
  "refetchOnMount: 'always'",
  'mobile mount reconciliation',
)
requireText(
  'mobile/src/lib/QueryProvider.tsx',
  "const CACHE_BUSTER = 'nvet-mobile-cache-v3'",
  'mobile Phase 46 cache buster',
)

requireText(
  'dashboard/src/lib/sessionCache.ts',
  "DASHBOARD_SESSION_OWNER_STORAGE_KEY = 'nvet-care-dashboard-session-owner-v1'",
  'dashboard per-user cache owner',
)
requireText('dashboard/src/lib/sessionCache.ts', 'queryClient.clear()', 'dashboard query cache purge')
requireText(
  'dashboard/src/lib/QueryProvider.tsx',
  "const APP_VERSION = '1.0.0-phase46-cache-v2'",
  'dashboard Phase 46 cache buster',
)

// Financial operations must remain explicitly user-confirmed; Phase 46 must not
// convert the recovery handoff into background payment replay.
const durablePolicy = read('mobile/src/lib/durableMutationPolicy.ts')
if (/payment/i.test(durablePolicy) && /durable|replay/i.test(durablePolicy)) {
  const allowlistedPayment = /payments?\/.+durable|durable.+payments?\//i.test(durablePolicy)
  if (allowlistedPayment) {
    failures.push('financial payment mutation appears in durable replay policy')
  }
}

const report = {
  phase: 46,
  candidate: manifest.candidate,
  status: failures.length === 0 ? 'PASS' : 'FAIL',
  sharedCanonicalQueryRoots: manifest.sharedCanonicalQueryRoots,
  checks: {
    sessionCacheOwnership: failures.every((f) => !f.includes('cache owner')),
    canonicalMobileAuthBoundary: failures.every(
      (f) => !f.includes('mobile auth') && !f.includes('authenticated-user adoption'),
    ),
    logoutCleanup: failures.every((f) => !f.includes('cache cleanup')),
    mobileForegroundConvergence: failures.every((f) => !f.includes('mount reconciliation')),
    financialReplayBoundaryPreserved: failures.every((f) => !f.includes('financial payment mutation')),
  },
  failures,
}

if (process.argv.includes('--write-evidence')) {
  const outputDir = path.join(root, '.artifacts', 'phase46')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(
    path.join(outputDir, 'phase46-convergence-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
}

console.log(JSON.stringify(report, null, 2))
if (failures.length > 0) process.exit(1)
