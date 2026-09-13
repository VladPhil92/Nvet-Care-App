import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function readArg(name, fallback) {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

const lockfilePath = readArg('--lockfile', 'package-lock.json');
const outputPath = readArg('--output', '.artifacts/phase32/npm-sbom.spdx.json');

function fail(message) {
  throw new Error(`SPDX lockfile generator: ${message}`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function packageNameFromPath(packagePath, entry) {
  if (typeof entry.name === 'string' && entry.name.trim()) return entry.name.trim();
  if (!packagePath) return 'nvet-care-platform';
  const marker = 'node_modules/';
  const index = packagePath.lastIndexOf(marker);
  if (index >= 0) return packagePath.slice(index + marker.length);
  return packagePath.replace(/^\.\//, '') || 'nvet-care-platform';
}

function packageSpdxId(packagePath) {
  if (!packagePath) return 'SPDXRef-RootPackage';
  return `SPDXRef-Package-${sha256(packagePath).slice(0, 24)}`;
}

function integrityChecksums(integrity) {
  if (typeof integrity !== 'string' || integrity.trim().length === 0) return undefined;
  const checksums = [];
  for (const token of integrity.trim().split(/\s+/)) {
    const match = token.match(/^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/i);
    if (!match) continue;
    checksums.push({
      algorithm: match[1].toUpperCase(),
      checksumValue: Buffer.from(match[2], 'base64').toString('hex'),
    });
  }
  return checksums.length ? checksums : undefined;
}

function deterministicCreatedAt() {
  if (process.env.SOURCE_DATE_EPOCH) {
    const seconds = Number(process.env.SOURCE_DATE_EPOCH);
    if (!Number.isFinite(seconds) || seconds < 0) fail('SOURCE_DATE_EPOCH must be a non-negative number');
    return new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');
  }
  try {
    const raw = execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().replace('.000Z', 'Z');
  } catch {
    // Fall through to a deterministic epoch rather than introduce wall-clock drift.
  }
  return '1970-01-01T00:00:00Z';
}

const absoluteLockfile = path.resolve(ROOT, lockfilePath);
const rawLockfile = await fs.readFile(absoluteLockfile, 'utf8');
const lock = JSON.parse(rawLockfile);

if (lock.lockfileVersion !== 3) fail(`expected package-lock v3, received ${lock.lockfileVersion}`);
if (!lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) {
  fail('package-lock packages map is missing');
}

const rootEntry = lock.packages[''] ?? {};
const rootName = packageNameFromPath('', rootEntry);
const rootVersion = rootEntry.version ?? '0.0.0';
const lockHash = sha256(rawLockfile);

const packages = [];
const relationships = [
  {
    spdxElementId: 'SPDXRef-DOCUMENT',
    relationshipType: 'DESCRIBES',
    relatedSpdxElement: 'SPDXRef-RootPackage',
  },
];

for (const [packagePath, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!entry || typeof entry !== 'object') continue;
  const name = packageNameFromPath(packagePath, entry);
  const spdxId = packageSpdxId(packagePath);
  const item = {
    name,
    SPDXID: spdxId,
    versionInfo: String(entry.version ?? (packagePath === '' ? rootVersion : '0.0.0')),
    downloadLocation: typeof entry.resolved === 'string' && entry.resolved.trim()
      ? entry.resolved.trim()
      : 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: 'NOASSERTION',
    copyrightText: 'NOASSERTION',
  };
  const checksums = integrityChecksums(entry.integrity);
  if (checksums) item.checksums = checksums;
  packages.push(item);

  if (packagePath !== '') {
    relationships.push({
      spdxElementId: 'SPDXRef-RootPackage',
      relationshipType: 'CONTAINS',
      relatedSpdxElement: spdxId,
    });
  }
}

if (!packages.some((item) => item.SPDXID === 'SPDXRef-RootPackage')) {
  fail('root package is missing from generated inventory');
}
if (packages.length < 2) fail('generated SBOM contains no dependency inventory');

const document = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: `${rootName}-${rootVersion}-package-lock-sbom`,
  documentNamespace: `https://ctgone.com/nvetcareapp/spdx/${lockHash}`,
  creationInfo: {
    created: deterministicCreatedAt(),
    creators: ['Tool: Nvet-Care-App Phase32 lockfile SPDX generator'],
  },
  documentDescribes: ['SPDXRef-RootPackage'],
  packages,
  relationships,
};

const absoluteOutput = path.resolve(ROOT, outputPath);
await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
await fs.writeFile(absoluteOutput, `${JSON.stringify(document, null, 2)}\n`);

console.log(`Generated SPDX 2.3 SBOM: ${path.relative(ROOT, absoluteOutput)}`);
console.log(`Packages inventoried: ${packages.length}`);
console.log(`Canonical lockfile SHA-256: ${lockHash}`);
