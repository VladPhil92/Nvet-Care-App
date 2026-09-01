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
    name: 'Sincronizar Prisma schema (sin aceptar pérdida de datos)',
    command: 'npx',
    args: [
      'prisma',
      'db',
      'push',
      '--schema',
      'prisma/schema.prisma',
      '--skip-generate',
    ],
  },
  {
    name: 'Aplicar identidad SUPERADMIN canónica de CTG One',
    command: 'npx',
    args: [
      'prisma',
      'db',
      'execute',
      '--file',
      'prisma/migrations/manual/ctg_superadmin_identity_v1.sql',
      '--schema',
      'prisma/schema.prisma',
    ],
  },
  {
    name: 'Aplicar guard de integridad de reservas',
    command: 'npx',
    args: [
      'prisma',
      'db',
      'execute',
      '--file',
      'prisma/migrations/manual/booking_integrity_v1.sql',
      '--schema',
      'prisma/schema.prisma',
    ],
  },
  {
    name: 'Aplicar almacenamiento privado de ubicación en vivo',
    command: 'npx',
    args: [
      'prisma',
      'db',
      'execute',
      '--file',
      'prisma/migrations/manual/live_location_v1.sql',
      '--schema',
      'prisma/schema.prisma',
    ],
  },
];

// Deployment readiness and test-fixture readiness are separate contracts.
// Staging may deploy schema/runtime safely even when its secret-backed E2E
// identities are not installed yet. In that case the deploy succeeds but the
// Staging E2E / Web Production Convergence gates remain fail-closed. This avoids
// turning missing test credentials into an application deployment outage.
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
      ? '\n✅ Predeploy de staging completado y fixtures E2E sembrados.'
      : '\n✅ Predeploy de staging completado sin fixtures; el gate E2E permanece independiente y fail-closed.',
  );
} else {
  console.log(
    '\n✅ Predeploy de producción completado sin aceptar pérdida de datos.',
  );
}
