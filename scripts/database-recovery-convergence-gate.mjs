import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const baseline = '20260801000000_baseline_current_schema';

function full(rel) {
  return path.join(root, rel);
}

function exists(rel) {
  return fs.existsSync(full(rel));
}

function read(rel) {
  return fs.readFileSync(full(rel), 'utf8');
}

function requireFile(rel, purpose) {
  if (!exists(rel)) failures.push(`${purpose}: missing ${rel}`);
}

function requireText(rel, pattern, purpose) {
  if (!exists(rel) || !pattern.test(read(rel))) {
    failures.push(`${purpose}: ${rel} does not satisfy ${pattern}`);
  }
}

const baselinePath = `backend/prisma/migrations/${baseline}/migration.sql`;
requireFile(baselinePath, 'Canonical Prisma baseline');
requireFile('backend/prisma/migrations/migration_lock.toml', 'Prisma migration lock');
requireFile('backend/scripts/database-migrate.mjs', 'Canonical migration runner');

if (exists(baselinePath) && fs.statSync(full(baselinePath)).size < 5_000) {
  failures.push('Canonical Prisma baseline is unexpectedly small');
}

requireText(
  'backend/prisma/migrations/migration_lock.toml',
  /provider\s*=\s*["']postgresql["']/,
  'Migration provider must remain PostgreSQL',
);

const gitignore = read('backend/.gitignore');
if (/prisma\/migrations\/.*migration\.sql/.test(gitignore)) {
  failures.push('Prisma migration SQL must be versioned, not ignored');
}

const migrationRoot = full('backend/prisma/migrations');
const versioned = fs
  .readdirSync(migrationRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'manual')
  .map((entry) => entry.name)
  .sort();
if (versioned[0] !== baseline) {
  failures.push(`Baseline must be the first versioned migration; found ${versioned[0] ?? 'none'}`);
}
for (const migration of versioned) {
  requireFile(
    `backend/prisma/migrations/${migration}/migration.sql`,
    `Versioned migration ${migration}`,
  );
}

const predeploy = read('backend/scripts/production-predeploy.mjs');
if (!/scripts\/database-migrate\.mjs/.test(predeploy)) {
  failures.push('Production predeploy must delegate to database-migrate.mjs');
}
if (/prisma[\s\S]{0,120}db[\s\S]{0,40}push/.test(predeploy)) {
  failures.push('Production predeploy must not execute prisma db push directly');
}
if (/prisma[\s\S]{0,120}db[\s\S]{0,40}execute/.test(predeploy)) {
  failures.push('Production predeploy must not execute manual SQL directly');
}

const runner = read('backend/scripts/database-migrate.mjs');
for (const [pattern, purpose] of [
  [/20260801000000_baseline_current_schema/, 'baseline adoption'],
  [/'migrate',[\s\S]{0,40}'deploy'/, 'Prisma migrate deploy'],
  [/'migrate',[\s\S]{0,40}'resolve'/, 'legacy baseline resolve'],
  [/'db',[\s\S]{0,40}'push'/, 'one-time legacy bridge'],
  [/_nvet_manual_migrations/, 'manual migration ledger'],
  [/createHash\(['"]sha256['"]\)|createHash\('sha256'\)/, 'manual migration checksum'],
  [/--skip-generate/, 'non-destructive legacy bridge'],
]) {
  if (!pattern.test(runner)) failures.push(`Migration runner missing ${purpose}`);
}
if (/--accept-data-loss/.test(runner)) {
  failures.push('Migration runner must never use --accept-data-loss');
}

const recovery = read('.github/workflows/recovery-readiness.yml');
for (const [pattern, purpose] of [
  [/migrate deploy/, 'fresh migration reconstruction'],
  [/migrate diff/, 'migration/schema equivalence check'],
  [/legacy db-push database/i, 'legacy adoption rehearsal'],
  [/_prisma_migrations/, 'Prisma migration history restore verification'],
  [/_nvet_manual_migrations/, 'manual ledger restore verification'],
  [/pg_dump/, 'logical backup'],
  [/pg_restore/, 'isolated restore'],
]) {
  if (!pattern.test(recovery)) failures.push(`Recovery workflow missing ${purpose}`);
}

const backupAudit = read('scripts/audit-railway-production-backups.mjs');
for (const [pattern, purpose] of [
  [/backupCount\s*<\s*1/, 'real visible backup requirement'],
  [/latestBackupFresh/, 'backup freshness policy'],
  [/retentionSatisfied/, 'backup retention policy'],
]) {
  if (!pattern.test(backupAudit)) failures.push(`Railway backup audit missing ${purpose}`);
}

if (failures.length > 0) {
  console.error('❌ Database & Recovery Convergence gate failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('✅ Database & Recovery Convergence gate passed.');
console.log(`   baseline: ${baseline}`);
console.log(`   versioned migrations: ${versioned.length}`);
console.log('   production path: migrate deploy + immutable manual SQL ledger');
console.log('   recovery: fresh + legacy adoption + backup/restore rehearsal');
