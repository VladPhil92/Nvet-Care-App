import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const verifierPath = fileURLToPath(
  new URL('./verify-release-candidate-readiness.mjs', import.meta.url),
);

/**
 * Technical convergence intentionally excludes provider/operator payment
 * evidence. Bold/TRANSFER remains a release-promotion gate in the full RC
 * report, but its absence must not make healthy backend/web/mobile engineering
 * look like a broken build every six hours.
 *
 * We run the canonical verifier in report mode and only fail on BLOCKED entries
 * that are not explicitly classified as external payment-provider evidence.
 */
const result = spawnSync(
  process.execPath,
  [verifierPath, '--runtime', '--machine-only'],
  {
    encoding: 'utf8',
    env: {
      ...process.env,
      RC_ENFORCE: 'false',
    },
  },
);

const stdout = result.stdout || '';
const stderr = result.stderr || '';
process.stdout.write(stdout);
process.stderr.write(stderr);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(
    `Canonical readiness verifier exited unexpectedly with code ${result.status}`,
  );
}

const blockedLines = stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('BLOCKED |'));

const deferredPaymentPatterns = [
  /^BLOCKED \| TRANSFER application rail certification freshness \|/,
];

const deferredPayment = blockedLines.filter((line) =>
  deferredPaymentPatterns.some((pattern) => pattern.test(line)),
);
const technicalBlockers = blockedLines.filter(
  (line) => !deferredPayment.includes(line),
);

for (const line of deferredPayment) {
  console.log(`DEFERRED_EXTERNAL | ${line.replace(/^BLOCKED \| /, '')}`);
}

if (technicalBlockers.length > 0) {
  console.error('Technical convergence failed:');
  for (const line of technicalBlockers) console.error(`- ${line}`);
  process.exit(1);
}

console.log(
  'PASS | Provider-independent technical readiness | payment provider evidence is tracked separately from engineering convergence',
);
