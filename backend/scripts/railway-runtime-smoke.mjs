import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 3000);
const apiBase = `http://127.0.0.1:${port}/api`;
const startupTimeoutMs = Number(
  process.env.NVET_RUNTIME_SMOKE_TIMEOUT_MS || 90_000,
);

const child = spawn(process.execPath, ['dist/main.js'], {
  stdio: 'inherit',
  env: process.env,
});

let childExit = null;
child.once('exit', (code, signal) => {
  childExit = { code, signal };
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 4_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForReadiness() {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError = 'service not ready';

  while (Date.now() < deadline) {
    if (childExit) {
      throw new Error(
        `NestJS exited before readiness (code=${childExit.code}, signal=${childExit.signal})`,
      );
    }

    try {
      const response = await fetchWithTimeout(`${apiBase}/health/ready`);
      const body = await response.text();
      if (response.ok) {
        console.log(`✅ Railway runtime readiness passed (${response.status})`);
        return;
      }
      lastError = `readiness HTTP ${response.status}: ${body.slice(0, 300)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(750);
  }

  throw new Error(`Readiness timeout after ${startupTimeoutMs}ms: ${lastError}`);
}

async function verifyLoginPath() {
  const deploymentSuffix = (
    process.env.RAILWAY_DEPLOYMENT_ID || randomUUID()
  )
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 24);

  const response = await fetchWithTimeout(
    `${apiBase}/auth/login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': `railway-smoke-${deploymentSuffix}`,
      },
      body: JSON.stringify({
        email: `nvet-runtime-smoke-${deploymentSuffix}@example.com`,
        password: 'NvetSmoke-NotARealPassword-2026!',
        deviceLabel: 'Railway runtime smoke gate',
      }),
    },
    10_000,
  );

  const body = await response.text();

  if (response.status !== 401) {
    throw new Error(
      `Login smoke returned HTTP ${response.status}; expected 401: ${body.slice(0, 500)}`,
    );
  }

  if (/PrismaError|PrismaClient|database error/i.test(body)) {
    throw new Error(
      `Login smoke exposed a database/Prisma error: ${body.slice(0, 500)}`,
    );
  }

  console.log('✅ Railway auth smoke passed (401, no Prisma/5xx)');
}

function stopChild() {
  if (!child.killed && child.exitCode === null) {
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed && child.exitCode === null) child.kill('SIGKILL');
    }, 5_000).unref();
  }
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    stopChild();
  });
}

try {
  await waitForReadiness();
  await verifyLoginPath();
  console.log('✅ Nvet Railway runtime smoke gate passed; service remains online');
} catch (error) {
  console.error('❌ Nvet Railway runtime smoke gate failed:', error);
  stopChild();
  process.exitCode = 1;
}

child.on('exit', (code, signal) => {
  if (process.exitCode === 1) return;
  if (signal) {
    console.error(`NestJS exited by signal ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
