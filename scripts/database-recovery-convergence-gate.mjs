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

for (const manualFile of [
  'auth_hardening_v2.sql',
  'booking_integrity_v1.sql',
  'ctg_superadmin_identity_v1.sql',
  'live_location_v1.sql',
  'resolve_todos.sql',
]) {
  requireFile(
    `backend/prisma/manual-migrations/${manualFile}`,
    `Manual SQL outside Prisma history: ${manualFile}`,
  );
}

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
const migrationDirectories = fs
  .readdirSync(migrationRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const directory of migrationDirectories) {
  if (!/^\d{14}_[a-z0-9_]+$/i.test(directory)) {
    failures.push(
      `Non-versioned directory inside prisma/migrations: ${directory}. Manual SQL belongs in prisma/manual-migrations.`,
    );
  }
}

const versioned = migrationDirectories.filter((directory) =>
  /^\d{14}_[a-z0-9_]+$/i.test(directory),
);
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
  [/prisma\/manual-migrations\//, 'manual SQL isolation from Prisma migration history'],
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

const recoveryPush = recovery.match(/\n  push:\n([\s\S]*?)\n  schedule:/);
if (!recoveryPush || !/branches:\s*\[main\]/.test(recoveryPush[1])) {
  failures.push('Recovery workflow must execute for pushes to main');
} else if (/\bpaths:/.test(recoveryPush[1])) {
  failures.push('Recovery workflow push trigger must not be path-filtered; every main candidate needs fresh evidence');
}

const webConvergence = read('.github/workflows/web-production-convergence.yml');
if (!/workflows:\s*\['Nvet Recovery Readiness'\]/.test(webConvergence)) {
  failures.push('Web Production Convergence must be downstream of Nvet Recovery Readiness');
}
if (/workflows:\s*\['Nvet Transfer Payment Rail Certification'\]/.test(webConvergence)) {
  failures.push('Web Production Convergence must not race recovery by triggering directly from payment certification');
}
for (const [pattern, purpose] of [
  [/Verify exact-candidate recovery evidence/, 'explicit exact-candidate recovery step'],
  [/run\?\.head_sha\s*===\s*sha/, 'candidate SHA binding'],
  [/run\?\.conclusion\s*===\s*'success'/, 'successful recovery conclusion binding'],
]) {
  if (!pattern.test(webConvergence)) failures.push(`Web convergence missing ${purpose}`);
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
console.log('   recovery: every main candidate + fresh/legacy backup/restore rehearsal');
console.log('   convergence: exact-candidate recovery evidence required before RC machine gate');
