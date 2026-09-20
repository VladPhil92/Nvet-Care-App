import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []

function exists(rel) {
  return fs.existsSync(path.join(root, rel))
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function walk(dir) {
  const absolute = path.join(root, dir)
  if (!fs.existsSync(absolute)) return []
  const result = []
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'coverage', 'dist', 'build', '__tests__', 'mocks'].includes(entry.name)) continue
      result.push(...walk(rel))
    } else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
      result.push(rel)
    }
  }
  return result
}

function requireFile(rel, purpose) {
  if (!exists(rel)) failures.push(`${purpose}: missing ${rel}`)
}

function requireText(rel, pattern, purpose) {
  if (!exists(rel) || !pattern.test(read(rel))) {
    failures.push(`${purpose}: ${rel} does not satisfy ${pattern}`)
  }
}

// ---------------------------------------------------------------------------
// 1. Mobile auth has one canonical runtime and no plaintext bearer storage.
// ---------------------------------------------------------------------------
const legacyAuthFacade = 'mobile/src/services/auth.service.v2.ts'
if (exists(legacyAuthFacade)) {
  const facade = read(legacyAuthFacade)
  const containsImplementation =
    /(?:apiClient|secureStorage|AsyncStorage|axios|class\s+Auth|const\s+authService\s*=|create\()/m.test(
      facade,
    )
  const redirectsToCanonical = /from\s+['"]\.\/auth\.service['"]/.test(facade)
  if (containsImplementation || !redirectsToCanonical) {
    failures.push(
      'Canonical mobile auth: auth.service.v2.ts may only be a pure re-export of ./auth.service',
    )
  }
}

requireFile(
  'mobile/android/app/src/main/java/com/nvetcare/NvetSecureStorageModule.kt',
  'Android protected session vault',
)
requireText(
  'mobile/src/services/api.ts',
  /secureStorage\.getAccessToken\(\)/,
  'Mobile HTTP auth must read the access token from protected storage',
)
requireText(
  'mobile/src/stores/useChatStore.ts',
  /secureStorage\.getAccessToken\(\)/,
  'Mobile WebSocket auth must read the access token from protected storage',
)

for (const rel of walk('mobile/src')) {
  if (rel.endsWith('mobile/src/lib/secureStorage.ts')) continue
  const source = read(rel)
  if (
    /AsyncStorage/.test(source) &&
    /['"](?:accessToken|refreshToken|@secure:tokens)['"]/.test(source)
  ) {
    failures.push(`Plaintext mobile session storage detected in ${rel}`)
  }
}

// ---------------------------------------------------------------------------
// 2. Dashboard refresh credential is HttpOnly; access token is memory-only.
// ---------------------------------------------------------------------------
requireText(
  'dashboard/src/services/api.ts',
  /withCredentials:\s*true/,
  'Dashboard must send HttpOnly refresh cookie',
)
requireText(
  'dashboard/src/services/session.ts',
  /let accessToken:\s*string \| null = null/,
  'Dashboard access token must be memory-only',
)

for (const rel of walk('dashboard/src')) {
  const source = read(rel)
  if (
    /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\(\s*['"](?:accessToken|refreshToken)['"]/.test(
      source,
    )
  ) {
    failures.push(`Persistent dashboard bearer credential detected in ${rel}`)
  }
}

requireText(
  'backend/src/auth/auth.controller.ts',
  /httpOnly:\s*true/,
  'Backend browser refresh cookie must be HttpOnly',
)
requireText(
  'backend/src/auth/auth.controller.ts',
  /x-nvet-session-mode/,
  'Cookie refresh mode must require an explicit CORS-preflight header',
)

// ---------------------------------------------------------------------------
// 3. Anonymous vet directory is protected by an explicit DTO/allowlist border.
// ---------------------------------------------------------------------------
requireFile(
  'backend/src/common/interceptors/public-vet-privacy.interceptor.ts',
  'Public veterinarian privacy boundary',
)
requireText(
  'backend/src/common/common.module.ts',
  /PublicVetPrivacyInterceptor/,
  'Public veterinarian privacy interceptor must be globally installed',
)

// ---------------------------------------------------------------------------
// 4. Upload persistence validates real content and private-sensitive domains.
// ---------------------------------------------------------------------------
requireText(
  'backend/src/common/storage/storage.service.ts',
  /magicBytes\.validate\(/,
  'Persisted uploads must validate file signatures',
)
requireText(
  'backend/src/common/storage/storage.service.ts',
  /folder\.startsWith\("verification\/"\)/,
  'Verification documents must be classified as sensitive',
)
requireText(
  'backend/src/common/storage/storage.service.ts',
  /folder\.startsWith\("transfers\/"\)/,
  'Transfer evidence must be classified as sensitive',
)
requireText(
  'backend/src/common/storage/storage.service.ts',
  /type:\s*options\.visibility === "private" \? "authenticated" : "upload"/,
  'Cloud storage private delivery must use authenticated assets',
)

// ---------------------------------------------------------------------------
// 5. Dashboard edge perimeter blocks hostile framing and passive data leakage.
// ---------------------------------------------------------------------------
requireText(
  'dashboard/vercel.json',
  /Content-Security-Policy/,
  'Dashboard must emit a Content Security Policy',
)
for (const directive of ["base-uri 'self'", "frame-ancestors 'none'", "object-src 'none'"]) {
  requireText(
    'dashboard/vercel.json',
    new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `Dashboard CSP must include ${directive}`,
  )
}
for (const header of [
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'X-Permitted-Cross-Domain-Policies',
  'X-DNS-Prefetch-Control',
]) {
  requireText(
    'dashboard/vercel.json',
    new RegExp(header),
    `Dashboard HTTP perimeter must include ${header}`,
  )
}

// ---------------------------------------------------------------------------
// 6. Production runtime boundaries fail closed instead of inheriting local or
//    production-identity defaults implicitly.
// ---------------------------------------------------------------------------
requireFile(
  'backend/src/common/config/runtime-boundaries.ts',
  'Production runtime boundary configuration',
)
requireFile(
  'backend/src/common/config/runtime-boundaries.spec.ts',
  'Production runtime boundary regression tests',
)
requireText(
  'backend/src/main.ts',
  /applyIdentityLaunchDefaults[\s\S]*resolveAllowedOrigins/,
  'Backend bootstrap must use canonical runtime boundary helpers',
)
requireText(
  'backend/src/common/config/runtime-boundaries.ts',
  /NVET_CTG_SUPABASE_URL is required when CTG identity exchange is enabled/,
  'CTG identity exchange must fail closed without an explicit provider URL',
)
requireText(
  'backend/src/common/config/runtime-boundaries.ts',
  /Production CORS must not allow localhost origins/,
  'Production CORS must reject localhost origins',
)
requireText(
  'backend/src/common/config/runtime-boundaries.ts',
  /must configure at least one production origin/,
  'Production CORS must fail closed without an explicit origin allowlist',
)
if (/https:\/\/[A-Za-z0-9-]+\.supabase\.co/.test(read('backend/src/main.ts'))) {
  failures.push(
    'Production identity boundary: backend/src/main.ts must not embed a Supabase production project fallback',
  )
}

// ---------------------------------------------------------------------------
// 7. workflow_run certification concurrency distinguishes valid from skipped
//    triggers before job-level `if` is evaluated by GitHub Actions.
// ---------------------------------------------------------------------------
const certificationWorkflows = [
  '.github/workflows/staging-e2e.yml',
  '.github/workflows/payment-rail-certification.yml',
  '.github/workflows/mobile-e2e.yml',
  '.github/workflows/web-production-convergence.yml',
]
for (const rel of certificationWorkflows) {
  requireText(
    rel,
    /group:\s*\$\{\{[^\n]*github\.event\.workflow_run\.conclusion\s*==\s*'success'[^\n]*github\.event\.workflow_run\.head_branch\s*==\s*'main'/,
    'Certification concurrency must admit only successful main workflow_run events into the shared candidate group',
  )
  requireText(
    rel,
    /format\('nvet-[^']*-\{0\}',\s*github\.event\.workflow_run\.head_sha\)/,
    'Valid certification workflow runs must deduplicate by candidate SHA',
  )
  requireText(
    rel,
    /format\('nvet-[^']*-noncert-\{0\}',\s*github\.run_id\)/,
    'Non-certifiable workflow_run events must use a unique run-scoped concurrency group',
  )
  requireText(
    rel,
    /cancel-in-progress:\s*true/,
    'Valid duplicate certification should remain cancellable for the same candidate',
  )
}

// Web convergence performs both production attestation and a staging evidence
// load. The staging loader must override the production defaults locally so its
// target guard cannot confuse the staging environment/service with production.
requireText(
  '.github/workflows/web-production-convergence.yml',
  /Load autonomous staging evidence session[\s\S]{0,260}RAILWAY_EXPECTED_ENVIRONMENT_NAME:\s*staging[\s\S]{0,160}RAILWAY_EXPECTED_SERVICE_NAME:\s*nvet-staging-backend/,
  'Web convergence staging loader must use explicit staging target names',
)

// ---------------------------------------------------------------------------
// 8. Operator evidence is part of the aggregated CI security boundary.
//    A manual readiness promotion must be reproducible from the append-only
//    approved ledger; otherwise the sync would change the checked-in manifest.
// ---------------------------------------------------------------------------
const operatorEvidenceManifestPaths = [
  'docs/production/RC_READINESS.json',
  'docs/production/ANDROID_PRODUCTION_READINESS.json',
  'docs/production/BETA_CARTAGENA_READINESS.json',
  'docs/production/GLOBAL_READINESS.json',
]
try {
  const {
    loadOperatorEvidenceControl,
    loadOperatorEvidenceRecords,
    syncReadinessManifestsFromOperatorEvidence,
  } = await import('./lib/operator-evidence.mjs')
  const control = await loadOperatorEvidenceControl()
  await loadOperatorEvidenceRecords(control)
  const before = new Map(operatorEvidenceManifestPaths.map((rel) => [rel, read(rel)]))
  await syncReadinessManifestsFromOperatorEvidence()
  for (const rel of operatorEvidenceManifestPaths) {
    if (read(rel) !== before.get(rel)) {
      failures.push(`Operator evidence projection mismatch: ${rel} is not derived from the approved append-only ledger`)
    }
  }
} catch (error) {
  failures.push(`Operator evidence control plane failed closed: ${error?.message ?? error}`)
}

// ---------------------------------------------------------------------------
// 9. Phase 27 release candidate freeze is inside CI Success, not an optional
//    side workflow. Product-code drift must therefore fail the existing
//    protected Security Convergence job unless it is an auditable blocker.
// ---------------------------------------------------------------------------
try {
  await import('./verify-release-candidate-freeze.mjs')
} catch (error) {
  failures.push(`Phase 27 release candidate freeze failed closed: ${error?.message ?? error}`)
}

// ---------------------------------------------------------------------------
// 10. Multipart upload modules remain bounded even after the NestJS 12 /
//     Express 5 / Multer 2 migration. These limits are defense-in-depth and
//     must not be removed merely because the upstream Multer advisories closed.
// ---------------------------------------------------------------------------
const rootPackage = JSON.parse(read('package.json'))
const backendPackage = JSON.parse(read('backend/package.json'))
const vulnerabilityExceptions = JSON.parse(
  read('docs/production/PHASE_38_VULNERABILITY_EXCEPTIONS.json'),
)

const declaredDependencyMajor = (range) => {
  if (typeof range !== 'string') return null

  const match = range
    .trim()
    .match(/^[~^]?([0-9]+)(?:[.][0-9]+){0,2}(?:-[0-9A-Za-z.-]+)?$/)

  return match ? Number.parseInt(match[1], 10) : null
}

for (const [pkg, expectedMajor] of [
  ['@nestjs/common', 12],
  ['@nestjs/core', 12],
  ['@nestjs/platform-express', 12],
  ['@nestjs/platform-socket.io', 12],
  ['@nestjs/websockets', 12],
  ['@nestjs/swagger', 12],
  ['nestjs-pino', 5],
  ['pino', 10],
]) {
  const version = backendPackage.dependencies?.[pkg]
  if (declaredDependencyMajor(version) !== expectedMajor) {
    failures.push(
      `Phase 2A runtime boundary: ${pkg} must remain on the certified ${expectedMajor}.x line`,
    )
  }
}

if (rootPackage.engines?.node !== '>=22.22.3') {
  failures.push(
    'Phase 2A runtime boundary: root Node engine must remain >=22.22.3 for Nest 12 tooling',
  )
}

if (rootPackage.overrides?.['js-yaml'] !== '4.3.2') {
  failures.push(
    'Phase 2A vulnerability boundary: js-yaml must remain pinned to patched 4.3.2 unless Phase 38 proves a newer safe resolution',
  )
}

for (const resolvedBackendException of [
  '@nestjs/platform-express',
  'js-yaml',
  'lodash',
  'multer',
]) {
  if (
    vulnerabilityExceptions.exceptions?.some(
      (entry) => entry.package === resolvedBackendException,
    )
  ) {
    failures.push(
      `Phase 2A vulnerability boundary: resolved exception ${resolvedBackendException} must not be reintroduced`,
    )
  }
}

const requiredMultipartLimits = [
  'fileSize',
  'files',
  'fields',
  'parts',
  'fieldNameSize',
  'headerPairs',
]

// A commented-out limit leaves multer on its unbounded default, so the checks
// below run against source with comments stripped, and only inside the braces
// of each `limits` object — never against the module at large.
function stripComments(source) {
  let output = ''
  let mode = 'code'
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (mode === 'code') {
      if (char === '/' && next === '/') mode = 'line'
      else if (char === '/' && next === '*') mode = 'block'
      else output += char
    } else if (mode === 'line') {
      if (char === '\n') {
        mode = 'code'
        output += char
      }
    } else if (char === '*' && next === '/') {
      mode = 'code'
      index += 1
    }
  }
  return output
}

function extractLimitsBlocks(source) {
  const blocks = []
  const opener = /limits\s*:\s*\{/g
  let match
  while ((match = opener.exec(source)) !== null) {
    let depth = 1
    let index = match.index + match[0].length
    const start = index
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1
      else if (source[index] === '}') depth -= 1
      index += 1
    }
    if (depth === 0) blocks.push(source.slice(start, index - 1))
  }
  return blocks
}

const multipartModules = walk('backend/src').filter(
  (rel) =>
    !rel.endsWith('.spec.ts') &&
    /MulterModule\.register\(/.test(stripComments(read(rel))),
)

if (multipartModules.length === 0) {
  failures.push(
    'Multipart upload hardening: no MulterModule.register() call found to verify',
  )
}

for (const rel of multipartModules) {
  const blocks = extractLimitsBlocks(stripComments(read(rel)))
  if (blocks.length === 0) {
    failures.push(
      `Multipart upload hardening: ${rel} registers MulterModule without a \`limits\` object`,
    )
    continue
  }
  for (const block of blocks) {
    for (const limit of requiredMultipartLimits) {
      if (!new RegExp(`(?:^|[{,\\s])${limit}\\s*:\\s*\\d`).test(block)) {
        failures.push(
          `Multipart upload hardening: ${rel} must declare a numeric \`${limit}\` limit`,
        )
      }
    }
  }
}

if (failures.length > 0) {
  console.error('❌ Production Security, Privacy & Canonical Runtime Convergence gate failed:')
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}

console.log('✅ Security convergence gate passed')
console.log('   - mobile session storage: protected + one canonical auth implementation')
console.log('   - mobile WebSocket authentication: protected token vault')
console.log('   - dashboard refresh token: HttpOnly cookie')
console.log('   - public veterinarian responses: allowlisted')
console.log('   - sensitive uploads: magic-bytes + private storage contract')
console.log('   - dashboard HTTP perimeter: CSP + transport + anti-framing headers')
console.log('   - production runtime boundaries: explicit identity provider + production-only CORS allowlist')
console.log('   - workflow_run certification concurrency: valid-trigger scoped + skipped-run isolated')
console.log('   - web convergence staging context: explicit environment/service isolation')
console.log('   - operator evidence projection: append-only approved ledger bound to CI Success')
console.log('   - Phase 27 product freeze: release-blocker-only drift bound to CI Success')
console.log('   - Phase 2A runtime: NestJS 12 + Express 5/Multer 2 + Node 22.22.3+ enforced')
console.log('   - Phase 2A audit: resolved backend Phase 38 exceptions cannot be reintroduced')
console.log(
  `   - multipart upload limits: bounded file/field/part counters across ${multipartModules.length} module(s)`,
)
