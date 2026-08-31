import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no está disponible. Abortando predeploy.');
  process.exit(1);
}

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

console.log('\n✅ Predeploy de producción completado sin aceptar pérdida de datos.');
