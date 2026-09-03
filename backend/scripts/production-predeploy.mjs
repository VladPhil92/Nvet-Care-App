import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no está disponible. Abortando predeploy.');
  process.exit(1);
}

const stagingSeedRequested =
  process.env.NODE_ENV === 'staging' &&
  process.env.NVET_ALLOW_E2E_SEED === 'true' &&
  process.env.NVET_SEED_TARGET === 'staging';

const requiredStagingFixtureVars = [
  'E2E_CLIENT_EMAIL',
  'E2E_CLIENT_PASSWORD',
  'E2E_VET_EMAIL',
  'E2E_VET_PASSWORD',
];
const missingStagingFixtureVars = stagingSeedRequested
  ? requiredStagingFixtureVars.filter((name) => !process.env[name]?.trim())
  : [];
const shouldSeedIsolatedStaging =
  stagingSeedRequested && missingStagingFixtureVars.length === 0;

const steps = [
  {
    name: 'Aplicar convergencia versionada de base de datos',
    command: 'node',
    args: ['scripts/database-migrate.mjs'],
  },
];

if (shouldSeedIsolatedStaging) {
  steps.push({
    name: 'Sembrar fixtures E2E deterministas en staging aislado',
    command: 'npm',
    args: ['run', 'seed:e2e'],
  });
} else if (stagingSeedRequested) {
  console.warn(
    `⚠️ Staging E2E seed omitido: faltan credenciales secret-backed (${missingStagingFixtureVars.join(', ')}).`,
  );
  console.warn(
    'El deployment continuará; la certificación E2E seguirá bloqueada hasta instalar los secrets y ejecutar su gate dedicado.',
  );
}

for (const step of steps) {
  console.log(`\n▶ ${step.name}`);
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });

  if (result.error) {
    console.error(`❌ No se pudo ejecutar ${step.name}:`, result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`❌ ${step.name} falló con código ${result.status}.`);
    console.error(
      'El despliegue se detiene deliberadamente. No se usa --accept-data-loss en producción.',
    );
    process.exit(result.status ?? 1);
  }
}

if (process.env.NODE_ENV === 'staging') {
  console.log(
    shouldSeedIsolatedStaging
      ? '\n✅ Predeploy de staging completado con migraciones versionadas y fixtures E2E.'
      : '\n✅ Predeploy de staging completado con migraciones versionadas; fixtures pendientes de su gate independiente.',
  );
} else {
  console.log(
    '\n✅ Predeploy de producción completado mediante Prisma Migrate + ledger SQL inmutable.',
  );
}
