import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFLIGHT_PATH = path.join(ROOT, 'docs/production/ANDROID_RELEASE_PREFLIGHT.json');
const COMPLIANCE_PATH = path.join(ROOT, 'docs/production/ANDROID_PLAY_COMPLIANCE.json');
const DATA_SAFETY_PATH = path.join(ROOT, 'docs/production/GOOGLE_PLAY_DATA_SAFETY.md');
const APP_BUILD_PATH = path.join(ROOT, 'mobile/android/app/build.gradle');
const MAIN_NETWORK_PATH = path.join(
  ROOT,
  'mobile/android/app/src/main/res/xml/network_security_config.xml',
);
const DEBUG_NETWORK_PATH = path.join(
  ROOT,
  'mobile/android/app/src/debug/res/xml/network_security_config.xml',
);
const FEDERATION_SERVICE_PATH = path.join(ROOT, 'mobile/src/services/ctg-federation.service.ts');
const SECURE_STORAGE_PATH = path.join(ROOT, 'mobile/src/lib/secureStorage.ts');
const OUTPUT_PATH = path.join(ROOT, '.artifacts/google-play-launch-readiness-phase35.json');

const args = new Set(process.argv.slice(2));
const writeEvidence = args.has('--write-evidence');

function fail(message) {
  throw new Error(`Phase 35 Google Play launch readiness mismatch: ${message}`);
}

async function readText(file) {
  return fs.readFile(file, 'utf8');
}

async function readJson(file) {
  return JSON.parse(await readText(file));
}

function requireMatch(text, pattern, label) {
  if (!pattern.test(text)) fail(label);
}

function requireNoMatch(text, pattern, label) {
  if (pattern.test(text)) fail(label);
}

function requireVerifiedGate(preflight, key) {
  if (preflight.technicalGates?.[key] !== 'verified') {
    fail(`technical gate ${key} must remain verified`);
  }
}

async function main() {
  const [
    preflight,
    compliance,
    dataSafety,
    appBuild,
    mainNetwork,
    debugNetwork,
    federationService,
    secureStorage,
  ] = await Promise.all([
    readJson(PREFLIGHT_PATH),
    readJson(COMPLIANCE_PATH),
    readText(DATA_SAFETY_PATH),
    readText(APP_BUILD_PATH),
    readText(MAIN_NETWORK_PATH),
    readText(DEBUG_NETWORK_PATH),
    readText(FEDERATION_SERVICE_PATH),
    readText(SECURE_STORAGE_PATH),
  ]);

  if (preflight.convergencePhase !== 35) fail('ANDROID_RELEASE_PREFLIGHT convergencePhase must be 35');
  if (compliance.convergencePhase !== 35) fail('ANDROID_PLAY_COMPLIANCE convergencePhase must be 35');
  if (preflight.applicationId !== 'com.nvetcare' || compliance.applicationId !== 'com.nvetcare') {
    fail('package identity must remain com.nvetcare');
  }

  for (const gate of [
    'releaseR8MinificationEnabled',
    'releaseCleartextTrafficDisabled',
    'debugCleartextIsolated',
    'ctgFederationDataSafetyReconciled',
  ]) {
    requireVerifiedGate(preflight, gate);
  }

  requireMatch(
    appBuild,
    /def\s+enableProguardInReleaseBuilds\s*=\s*true\b/,
    'R8/minification must remain enabled for release builds',
  );
  requireMatch(
    appBuild,
    /release\s*\{[\s\S]*?minifyEnabled\s+enableProguardInReleaseBuilds[\s\S]*?proguardFiles/m,
    'release build type must consume the R8/minification switch and ProGuard rules',
  );

  requireMatch(
    mainNetwork,
    /<base-config\s+cleartextTrafficPermitted="false"\s*\/>/,
    'main/release network security must explicitly deny cleartext traffic',
  );
  requireNoMatch(
    mainNetwork,
    /cleartextTrafficPermitted="true"/,
    'main/release network security must not contain cleartext exceptions',
  );
  requireNoMatch(mainNetwork, /10\.0\.2\.2|localhost/, 'emulator hosts must not exist in main/release network policy');

  requireMatch(
    debugNetwork,
    /<base-config\s+cleartextTrafficPermitted="false"\s*\/>/,
    'debug policy must default to HTTPS even when emulator exceptions exist',
  );
  requireMatch(
    debugNetwork,
    /<domain-config\s+cleartextTrafficPermitted="true">/,
    'debug policy must scope cleartext access inside a domain-config',
  );
  const debugDomains = [...debugNetwork.matchAll(/<domain\s+includeSubdomains="false">([^<]+)<\/domain>/g)].map(
    (match) => match[1],
  );
  const expectedDebugDomains = ['10.0.2.2', 'localhost'];
  if (
    debugDomains.length !== expectedDebugDomains.length ||
    expectedDebugDomains.some((domain) => !debugDomains.includes(domain))
  ) {
    fail(`debug cleartext allowlist must be exactly ${expectedDebugDomains.join(', ')}`);
  }

  const federation = compliance.sdkInventory?.identityFederation;
  if (
    federation?.provider !== 'CTG One' ||
    federation?.authorizeOrigin !== 'https://ctgone.com' ||
    federation?.protocol !== 'authorization-code + PKCE S256' ||
    federation?.bearerTokenInRedirect !== false
  ) {
    fail('CTG One federation inventory must declare the canonical PKCE security boundary');
  }

  const federationInventory = (compliance.dataInventory ?? []).find((entry) => entry.id === 'federated-auth');
  if (!federationInventory || federationInventory.externalProcessorReviewRequired !== true) {
    fail('federated-auth data inventory must remain present and externally reviewable');
  }
  if (compliance.externalEvidence?.ctgOneFederationDataHandlingReview !== 'pending') {
    fail('CTG One production data-handling classification must remain pending until operator evidence exists');
  }

  requireMatch(
    federationService,
    /const\s+CTG_ONE_ORIGIN\s*=\s*['"]https:\/\/ctgone\.com['"]/,
    'mobile federation must use the canonical HTTPS CTG One origin',
  );
  const authorizeBlock = federationService.match(/const url =([\s\S]*?)\n\s*try \{/m)?.[1] ?? '';
  requireMatch(authorizeBlock, /response_type=code/, 'federation authorize URL must request an authorization code');
  requireMatch(authorizeBlock, /code_challenge=/, 'federation authorize URL must include the PKCE challenge');
  requireMatch(authorizeBlock, /state=/, 'federation authorize URL must include state');
  requireMatch(authorizeBlock, /redirect_uri=/, 'federation authorize URL must include the fixed redirect URI');
  requireNoMatch(
    authorizeBlock,
    /accessToken|refreshToken|supabaseAccessToken|bearer/i,
    'bearer/session tokens must never be placed in the browser redirect URL',
  );
  requireMatch(
    federationService,
    /fetch\(TOKEN_URL,[\s\S]*?codeVerifier:\s*pending\.verifier/m,
    'PKCE verifier must be sent only to the token exchange',
  );

  requireMatch(secureStorage, /codeChallengeMethod:\s*['"]S256['"]/, 'secure storage contract must pin PKCE S256');
  requireMatch(
    secureStorage,
    /consumeCtgFederationRequest\(callbackState:\s*string\)/,
    'secure storage must consume and validate the pending federation request',
  );
  requireMatch(
    secureStorage,
    /if \(testFederation\.state !== callbackState\)/,
    'state mismatch handling must remain fail-closed in the test contract',
  );

  requireMatch(dataSafety, /Federated authentication/i, 'Data Safety matrix must inventory federated authentication');
  requireMatch(dataSafety, /authorization-code flow with PKCE S256/i, 'Data Safety matrix must document PKCE S256');
  requireMatch(dataSafety, /ctgOneFederationDataHandlingReview.*pending/is, 'CTG One Data Safety classification must remain explicit and pending');
  requireMatch(dataSafety, /HTTPS-only default Android network policy/i, 'Data Safety source must document release transport hardening');
  requireMatch(dataSafety, /R8\/minification/i, 'Data Safety release evidence must include the minified release boundary');

  const report = {
    schemaVersion: 1,
    convergencePhase: 35,
    program: 'google-play-launch-readiness',
    applicationId: 'com.nvetcare',
    status: 'READY_REPOSITORY_SIDE',
    releaseR8Minification: 'verified',
    releaseCleartextTraffic: 'denied',
    debugCleartextAllowlist: expectedDebugDomains,
    ctgOneFederation: {
      protocol: federation.protocol,
      origin: federation.authorizeOrigin,
      bearerTokenInRedirect: federation.bearerTokenInRedirect,
      playDataHandlingReview: compliance.externalEvidence.ctgOneFederationDataHandlingReview,
    },
    externalEvidence: 'OPERATOR_REQUIRED',
    checkedAt: new Date().toISOString(),
  };

  if (writeEvidence) {
    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log('PASS | Phase 35 Google Play launch readiness | repository-side gates verified');
  console.log('PASS | Android release transport | HTTPS-only');
  console.log('PASS | Android release minification | R8 enabled');
  console.log(`PASS | Debug cleartext isolation | ${expectedDebugDomains.join(', ')}`);
  console.log('PASS | CTG One federation | authorization code + PKCE S256; no bearer token in redirect');
  console.log('INFO | External Play/operator evidence remains pending and fail-closed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
