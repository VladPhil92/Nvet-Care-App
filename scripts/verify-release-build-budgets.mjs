import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = 'docs/production/RELEASE_CANDIDATE_FREEZE.json';
const ARTIFACT_PATH = '.artifacts/release-build-budgets.json';

function fail(message) {
  throw new Error(`Phase 27 build budget exceeded: ${message}`);
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), 'utf8'));
}

async function walk(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(child)));
    else if (entry.isFile()) {
      const stat = await fs.stat(path.join(ROOT, child));
      files.push({ path: child.replaceAll('\\', '/'), bytes: stat.size });
    }
  }
  return files;
}

const manifest = await readJson(MANIFEST_PATH);
const budgets = manifest.buildPerformanceBudgets;
if (!budgets) fail('missing buildPerformanceBudgets in release candidate manifest');

const backendFiles = await walk('backend/dist');
const dashboardFiles = await walk('dashboard/dist');
const backendBytes = backendFiles.reduce((sum, file) => sum + file.bytes, 0);
const dashboardBytes = dashboardFiles.reduce((sum, file) => sum + file.bytes, 0);
const dashboardAssets = dashboardFiles.filter((file) => file.path.includes('/assets/'));
const largestDashboardAsset = dashboardAssets.reduce(
  (largest, file) => (file.bytes > largest.bytes ? file : largest),
  { path: null, bytes: 0 },
);

const checks = [
  {
    id: 'backend-dist-size',
    value: backendBytes,
    budget: budgets.backendDistMaxBytes,
    pass: backendBytes <= budgets.backendDistMaxBytes,
  },
  {
    id: 'dashboard-dist-size',
    value: dashboardBytes,
    budget: budgets.dashboardDistMaxBytes,
    pass: dashboardBytes <= budgets.dashboardDistMaxBytes,
  },
  {
    id: 'dashboard-largest-asset',
    value: largestDashboardAsset.bytes,
    budget: budgets.dashboardLargestAssetMaxBytes,
    pass: largestDashboardAsset.bytes <= budgets.dashboardLargestAssetMaxBytes,
    asset: largestDashboardAsset.path,
  },
];

const artifact = {
  schemaVersion: 1,
  phase: 27,
  candidate: manifest.candidate,
  policy: budgets.policy,
  generatedAt: new Date().toISOString(),
  checks,
  totals: {
    backendDistBytes: backendBytes,
    backendFiles: backendFiles.length,
    dashboardDistBytes: dashboardBytes,
    dashboardFiles: dashboardFiles.length,
    largestDashboardAsset,
  },
  pass: checks.every((check) => check.pass),
};

await fs.mkdir(path.join(ROOT, '.artifacts'), { recursive: true });
await fs.writeFile(path.join(ROOT, ARTIFACT_PATH), `${JSON.stringify(artifact, null, 2)}\n`);

console.log('Nvet Care — Phase 27 Build Performance Budgets');
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'BREACHED'} | ${check.id} | ${check.value}/${check.budget} bytes`);
}

for (const check of checks.filter((entry) => !entry.pass)) {
  fail(`${check.id} is ${check.value} bytes and budget is ${check.budget} bytes`);
}
