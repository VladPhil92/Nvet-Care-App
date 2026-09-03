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
