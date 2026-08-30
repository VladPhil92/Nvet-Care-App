import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import * as tar from 'tar';

const compatRoot = process.cwd();
const canonicalRoot = path.join(compatRoot, 'canonical-runtime');
const backendDir = path.join(canonicalRoot, 'backend');
const backendPackage = path.join(backendDir, 'package.json');
const builtMain = path.join(backendDir, 'dist', 'main.js');

function requireCommitSha() {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA;
  if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) {
    console.error('❌ RAILWAY_GIT_COMMIT_SHA válido (40 hex) es obligatorio.');
    process.exit(1);
  }
  return sha;
}

function run(command, args, cwd, extraEnv = {}) {
  console.log(`▶ ${command} ${args.join(' ')}  [cwd=${cwd}]`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: false,
  });

  if (result.error) {
    console.error(`❌ No se pudo ejecutar ${command}:`, result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function downloadCanonicalSource() {
  const sha = requireCommitSha();
  const archiveUrl = `https://codeload.github.com/VladPhil92/Nvet-Care-App/tar.gz/${sha}`;
  const archivePath = path.join(compatRoot, 'nvet-source.tar.gz');

  console.log(`▶ Descargando fuente canónica exacta ${sha}`);
  const response = await fetch(archiveUrl, { redirect: 'follow' });
  if (!response.ok) {
    console.error(`❌ No se pudo descargar ${archiveUrl}: HTTP ${response.status}`);
    process.exit(1);
  }

  await rm(canonicalRoot, { recursive: true, force: true });
  await mkdir(canonicalRoot, { recursive: true });
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));

  await tar.x({
    file: archivePath,
    cwd: canonicalRoot,
    strip: 1,
  });
  await rm(archivePath, { force: true });

  if (!(await exists(backendPackage))) {
    console.error('❌ El SHA descargado no contiene backend/package.json.');
    process.exit(1);
  }
}

function verifyRuntimeModules() {
  const backendRequire = createRequire(backendPackage);
  const modules = [
    '@nestjs/core',
    '@nestjs/platform-express',
    '@prisma/client',
    'nestjs-pino',
    'pino-http',
    'pino',
    'redis',
    'socket.io',
  ];

  for (const moduleName of modules) {
    try {
      const resolved = backendRequire.resolve(moduleName);
      backendRequire(moduleName);
      console.log(`✅ Runtime module ${moduleName} -> ${resolved}`);
    } catch (error) {
      console.error(`❌ Runtime module ${moduleName} no es resoluble/cargable desde backend.`);
      console.error(error);
      process.exit(1);
    }
  }
}

async function prepare() {
  if (!(await exists(backendPackage))) {
    await downloadCanonicalSource();
  }

  // Install exactly the backend workspace from the canonical root lockfile.
  // Installing all workspaces can produce a different hoisting layout and can
  // separate a hoisted runtime package (for example nestjs-pino) from a module
  // it loads at runtime. This mirrors Dockerfile.railway and keeps the backend
  // dependency graph deterministic.
  run(
    'npm',
    [
      'ci',
      '--workspace',
      'backend',
      '--include-workspace-root',
      '--include=dev',
      '--legacy-peer-deps',
      '--no-audit',
      '--no-fund',
    ],
    canonicalRoot,
  );

  verifyRuntimeModules();

  run(
    'npx',
    ['prisma', 'generate'],
    backendDir,
    { DATABASE_URL: process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub?schema=public' },
  );
}

async function build() {
  await prepare();
  run('npm', ['run', 'build'], backendDir);

  if (!(await exists(builtMain))) {
    console.error('❌ El build canónico no produjo backend/dist/main.js.');
    process.exit(1);
  }

  // Re-run after build so the exact runtime artifact is never published with a
  // dependency tree that Node cannot load.
  verifyRuntimeModules();

  console.log('✅ Bridge build: backend canónico compilado y dependencias runtime verificadas.');
}

async function preflight() {
  if (!(await exists(builtMain))) {
    console.error('❌ Falta canonical-runtime/backend/dist/main.js; el build no se ejecutó.');
    process.exit(1);
  }

  verifyRuntimeModules();
  run('npm', ['run', 'deploy:preflight'], backendDir);
}

async function start() {
  await preflight();

  console.log('▶ Iniciando NestJS canónico');
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: backendDir,
    stdio: 'inherit',
    env: process.env,
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('error', (error) => {
    console.error('❌ No se pudo iniciar NestJS:', error);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`NestJS terminó por señal ${signal}.`);
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
}

const command = process.argv[2];

switch (command) {
  case 'prepare':
  case 'prisma-generate':
    await prepare();
    break;
  case 'build':
    await build();
    break;
  case 'preflight':
    await preflight();
    break;
  case 'start':
    await start();
    break;
  default:
    console.error(`Uso: node bridge.mjs <prepare|prisma-generate|build|preflight|start>`);
    process.exit(2);
}
