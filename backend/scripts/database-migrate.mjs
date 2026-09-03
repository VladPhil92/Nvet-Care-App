import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const BASELINE_MIGRATION = '20260801000000_baseline_current_schema';
const SCHEMA_PATH = 'prisma/schema.prisma';
const MANUAL_LEDGER_TABLE = '_nvet_manual_migrations';

const MANUAL_MIGRATIONS = [
  {
    name: 'ctg_superadmin_identity_v1',
    file: 'prisma/migrations/manual/ctg_superadmin_identity_v1.sql',
  },
  {
    name: 'booking_integrity_v1',
    file: 'prisma/migrations/manual/booking_integrity_v1.sql',
  },
  {
    name: 'live_location_v1',
    file: 'prisma/migrations/manual/live_location_v1.sql',
  },
];

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no está disponible. Abortando migración.');
  process.exit(1);
}

const prisma = new PrismaClient();

function runPrisma(label, args) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync('npx', ['prisma', ...args], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });

  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} falló con código ${result.status ?? 'desconocido'}`);
  }
}

async function tableExists(tableName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_tables
       WHERE schemaname = 'public' AND tablename = $1
     ) AS "exists"`,
    tableName,
  );
  return Boolean(rows?.[0]?.exists);
}

async function applicationTableCount() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS "count"
       FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('_prisma_migrations', '_nvet_manual_migrations')`,
  );
  return Number(rows?.[0]?.count ?? 0);
}

async function baselineApplied() {
  if (!(await tableExists('_prisma_migrations'))) return false;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT migration_name
       FROM "_prisma_migrations"
      WHERE migration_name = $1
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
      LIMIT 1`,
    BASELINE_MIGRATION,
  );
  return rows.length === 1;
}

async function adoptLegacyDatabaseOnce() {
  const ledgerAlreadyExists = await tableExists(MANUAL_LEDGER_TABLE);
  if (ledgerAlreadyExists) {
    throw new Error(
      'El historial Prisma perdió su baseline después de la convergencia. Se rechaza re-adoptar automáticamente una base ya convergida.',
    );
  }

  console.warn(
    '\n⚠️ Base legacy detectada sin baseline Prisma. Se ejecutará la adopción única, sin --accept-data-loss.',
  );

  // One-time bridge only. It preserves the exact fail-closed behavior used by
  // production before migration convergence, then permanently hands control to
  // Prisma Migrate. Once BASELINE_MIGRATION is recorded this path is unreachable.
  runPrisma('Alinear schema legacy una única vez', [
    'db',
    'push',
    '--schema',
    SCHEMA_PATH,
    '--skip-generate',
  ]);

  runPrisma('Registrar baseline verificado como aplicado', [
    'migrate',
    'resolve',
    '--applied',
    BASELINE_MIGRATION,
    '--schema',
    SCHEMA_PATH,
  ]);
}

async function applyVersionedMigrations() {
  const appTables = await applicationTableCount();
  const hasBaseline = await baselineApplied();

  if (appTables === 0) {
    console.log('\nℹ️ Base vacía detectada: Prisma Migrate reconstruirá el schema desde cero.');
  } else if (!hasBaseline) {
    await adoptLegacyDatabaseOnce();
  }

  runPrisma('Aplicar migraciones Prisma versionadas', [
    'migrate',
    'deploy',
    '--schema',
    SCHEMA_PATH,
  ]);

  runPrisma('Verificar estado de migraciones Prisma', [
    'migrate',
    'status',
    '--schema',
    SCHEMA_PATH,
  ]);
}

async function ensureManualLedger() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${MANUAL_LEDGER_TABLE}" (
      "name" TEXT PRIMARY KEY,
      "checksum_sha256" TEXT NOT NULL,
      "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function checksumFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function applyManualMigration(migration) {
  const checksum = checksumFile(migration.file);
  const existing = await prisma.$queryRawUnsafe(
    `SELECT checksum_sha256
       FROM "${MANUAL_LEDGER_TABLE}"
      WHERE name = $1
      LIMIT 1`,
    migration.name,
  );

  if (existing.length === 1) {
    if (existing[0].checksum_sha256 !== checksum) {
      throw new Error(
        `Migración manual inmutable modificada después de aplicarse: ${migration.name}`,
      );
    }
    console.log(`✓ ${migration.name}: ya aplicada; checksum verificado.`);
    return;
  }

  runPrisma(`Aplicar migración SQL ${migration.name}`, [
    'db',
    'execute',
    '--file',
    migration.file,
    '--schema',
    SCHEMA_PATH,
  ]);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "${MANUAL_LEDGER_TABLE}" (name, checksum_sha256)
     VALUES ($1, $2)`,
    migration.name,
    checksum,
  );
  console.log(`✓ ${migration.name}: aplicada y registrada (${checksum.slice(0, 12)}…).`);
}

async function applyManualMigrations() {
  await ensureManualLedger();
  for (const migration of MANUAL_MIGRATIONS) {
    await applyManualMigration(migration);
  }

  const rows = await prisma.$queryRawUnsafe(
    `SELECT name, checksum_sha256, applied_at
       FROM "${MANUAL_LEDGER_TABLE}"
      ORDER BY applied_at, name`,
  );

  const expected = new Set(MANUAL_MIGRATIONS.map((migration) => migration.name));
  const missing = [...expected].filter(
    (name) => !rows.some((row) => row.name === name),
  );
  if (missing.length > 0) {
    throw new Error(`Ledger SQL incompleto: faltan ${missing.join(', ')}`);
  }
}

try {
  await applyVersionedMigrations();
  await applyManualMigrations();
  console.log(
    `\n✅ Database migration convergence completada. Baseline=${BASELINE_MIGRATION}; manual=${MANUAL_MIGRATIONS.length}.`,
  );
} catch (error) {
  console.error(`\n❌ Database migration convergence falló: ${error.message}`);
  console.error(
    'No se usa --accept-data-loss. El despliegue se detiene antes de iniciar la aplicación.',
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
