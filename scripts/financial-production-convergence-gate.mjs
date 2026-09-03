import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const schema = read('backend/prisma/schema.prisma');
const migration = read(
  'backend/prisma/migrations/20260903032000_financial_production_convergence/migration.sql',
);
const controller = read('backend/src/payments/payments.controller.ts');
const operations = read('backend/src/payments/financial-operations.service.ts');
const crypto = read('backend/src/payments/financial-data-crypto.service.ts');
const privacy = read(
  'backend/src/common/interceptors/financial-privacy.interceptor.ts',
);
const commonModule = read('backend/src/common/common.module.ts');
const rc = JSON.parse(read('docs/production/RC_READINESS.json'));

const failures = [];
const requireMatch = (condition, message) => {
  if (!condition) failures.push(message);
};
const has = (text, needle) => text.includes(needle);

requireMatch(has(schema, 'model VetWithdrawal {'), 'Prisma must persist veterinarian withdrawals.');
requireMatch(
  has(schema, 'model FinancialSettlementBatch {'),
  'Prisma must persist settlement batches.',
);
requireMatch(
  has(schema, 'transferProofStorageKey String?'),
  'Transaction must have a dedicated transfer proof storage key.',
);
requireMatch(
  has(schema, 'transferProofSha256'),
  'Transaction must persist a transfer proof integrity hash.',
);
requireMatch(
  has(migration, 'transactions_transfer_evidence_required'),
  'Database must fail closed when a confirmed transfer lacks durable evidence.',
);
requireMatch(
  has(migration, 'vet_withdrawal_state_guard'),
  'Database must enforce withdrawal state transitions.',
);
requireMatch(
  has(operations, 'TransactionIsolationLevel.Serializable'),
  'Withdrawal reservation and settlement must use serializable transactions.',
);
requireMatch(
  has(operations, 'settlementBatchId: batch.id'),
  'Liquidated transactions must be attached to an auditable settlement batch.',
);
requireMatch(
  has(operations, 'transferProofSha256: proofSha256'),
  'Transfer proof SHA-256 must be persisted.',
);
requireMatch(
  has(operations, 'visibility: "private"'),
  'Transfer proofs must explicitly request private storage.',
);
requireMatch(
  has(crypto, 'aes-256-gcm'),
  'Payout destinations must use authenticated AES-256-GCM encryption.',
);
requireMatch(
  has(crypto, 'FINANCIAL_DATA_ENCRYPTION_KEY'),
  'Financial encryption must use a dedicated production secret.',
);
requireMatch(
  !/process\.env\.JWT_SECRET/.test(crypto),
  'Financial encryption must not silently fall back to JWT_SECRET.',
);
requireMatch(
  has(controller, 'Idempotency-Key es obligatorio para retiros'),
  'Withdrawal creation must require a persistent idempotency key.',
);
requireMatch(
  has(controller, 'this.financialOperations.submitTransferProof'),
  'TRANSFER proof submission must use the canonical financial operations service.',
);
requireMatch(
  has(controller, 'this.financialOperations.runSettlementBatch'),
  'Settlement endpoint must use the auditable batch service.',
);
requireMatch(
  has(controller, 'CTG payments are temporarily unavailable'),
  'CTG must remain fail-closed until its ledger is certified.',
);
requireMatch(
  has(controller, 'PSE payments are unavailable until a production gateway adapter is certified end-to-end'),
  'PSE must remain fail-closed in production.',
);
requireMatch(
  has(privacy, 'transferProofStorageKey') &&
    has(privacy, 'destinationCiphertext') &&
    has(privacy, 'destinationFingerprint'),
  'Financial response privacy must redact private storage/encryption fields.',
);
requireMatch(
  has(commonModule, 'useClass: FinancialPrivacyInterceptor'),
  'Financial response privacy must be globally enforced.',
);

const paymentGate = rc?.requiredExternalEvidence?.paymentRailVerified;
requireMatch(
  paymentGate?.status === 'pending',
  'paymentRailVerified must remain pending until controlled real funds movement is retained as operator evidence.',
);
requireMatch(
  /real bank transfer/i.test(paymentGate?.note || ''),
  'RC policy must continue to require a controlled real bank transfer.',
);

if (failures.length > 0) {
  console.error('Financial Production Convergence gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Financial Production Convergence gate passed.');
console.log('- TRANSFER evidence: private + integrity hashed + reviewable.');
console.log('- Settlement: durable serializable batches.');
console.log('- Withdrawals: durable, idempotent, encrypted and balance-reserving.');
console.log('- CTG/PSE: still fail-closed in production.');
console.log('- Real bank movement: remains an external RC gate.');
