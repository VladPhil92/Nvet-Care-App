import fs from 'node:fs/promises';

const rcPath = new URL('../docs/production/RC_READINESS.json', import.meta.url);
const betaPath = new URL('../docs/production/BETA_CARTAGENA_READINESS.json', import.meta.url);

const inheritedKeys = [
  'productionBackupConfigured',
  'restoreDrillVerified',
  'productionAlertingVerified',
  'paymentRailVerified',
];

const [rc, beta] = await Promise.all([
  fs.readFile(rcPath, 'utf8').then(JSON.parse),
  fs.readFile(betaPath, 'utf8').then(JSON.parse),
]);

for (const key of inheritedKeys) {
  const source = rc.requiredExternalEvidence?.[key];
  const target = beta.requiredEvidence?.[key];

  if (!source || !target) {
    throw new Error(`Missing inherited evidence key: ${key}`);
  }

  if (target.status !== source.status) {
    throw new Error(
      `Beta evidence ${key} drifted from RC: beta=${target.status} rc=${source.status}`,
    );
  }

  const sourceEvidence = source.evidence ?? null;
  const targetEvidence = target.evidence ?? null;
  if (source.status === 'verified' && targetEvidence !== sourceEvidence) {
    throw new Error(
      `Verified beta evidence ${key} must retain the exact RC evidence reference.`,
    );
  }

  if (source.status === 'pending' && targetEvidence !== null) {
    throw new Error(`Pending inherited beta evidence ${key} cannot carry evidence.`);
  }
}

console.log(
  `Cartagena beta inherited evidence is aligned with RC: ${inheritedKeys.join(', ')}`,
);
