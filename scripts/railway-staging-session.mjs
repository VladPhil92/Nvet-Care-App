import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const API_URL = 'https://backboard.railway.com/graphql/v2';
const mode = process.argv[2] || 'load';

const token = process.env.RAILWAY_API_TOKEN;
const projectId = process.env.RAILWAY_PROJECT_ID;
const environmentId = process.env.RAILWAY_STAGING_ENVIRONMENT_ID;
const serviceId = process.env.RAILWAY_STAGING_SERVICE_ID;
const candidateSha = process.env.RC_CANDIDATE_SHA || process.env.GITHUB_SHA;

const expectedProjectName = process.env.RAILWAY_EXPECTED_PROJECT_NAME || 'Nvet Care App';
const expectedEnvironmentName = process.env.RAILWAY_EXPECTED_ENVIRONMENT_NAME || 'staging';
const expectedServiceName = process.env.RAILWAY_EXPECTED_SERVICE_NAME || 'nvet-staging-backend';
const forbiddenProductionServiceId =
  process.env.RAILWAY_PRODUCTION_SERVICE_ID || '42e734a0-931b-45c8-a091-4334b54e9d1c';

const fixtureEmails = {
  E2E_CLIENT_EMAIL: 'nvet-e2e-client@nvetcare.invalid',
  E2E_VET_EMAIL: 'nvet-e2e-vet@nvetcare.invalid',
  E2E_ADMIN_EMAIL: 'nvet-e2e-admin@nvetcare.invalid',
};

const required = {
  RAILWAY_API_TOKEN: token,
  RAILWAY_PROJECT_ID: projectId,
  RAILWAY_STAGING_ENVIRONMENT_ID: environmentId,
  RAILWAY_STAGING_SERVICE_ID: serviceId,
};
for (const [name, value] of Object.entries(required)) {
  if (!value?.trim()) throw new Error(`${name} is required`);
}

if (!['prepare', 'load'].includes(mode)) {
  throw new Error('Usage: node scripts/railway-staging-session.mjs <prepare|load>');
}
if (serviceId === forbiddenProductionServiceId) {
  throw new Error('Refusing to operate on the canonical production backend service ID.');
}
if (mode === 'prepare' && !/^[0-9a-f]{40}$/i.test(candidateSha || '')) {
  throw new Error('prepare mode requires RC_CANDIDATE_SHA/GITHUB_SHA as a full commit SHA.');
}

async function graphql(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Railway returned non-JSON HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  if (!response.ok || payload.errors?.length) {
    const errors = payload.errors?.map((error) => error.message).join('; ') || text.slice(0, 500);
    throw new Error(`Railway GraphQL failed (HTTP ${response.status}): ${errors}`);
  }
  return payload.data;
}

function randomPassword() {
  return `${randomBytes(28).toString('base64url')}Aa1!`;
}

function mask(value) {
  if (process.env.GITHUB_ACTIONS === 'true' && value) {
    console.log(`::add-mask::${value}`);
  }
}

function writeEnv(name, value) {
  if (!process.env.GITHUB_ENV) return;
  appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}

function assertStagingUrl(apiUrl) {
  if (!/^https:\/\/[^\s]+\/api\/?$/i.test(apiUrl || '')) {
    throw new Error('Resolved E2E_API_URL must be an absolute HTTPS URL ending in /api.');
  }
  if (
    /backend-production-a476\.up\.railway\.app/i.test(apiUrl) ||
    /^https:\/\/(www\.)?ctgone\.com\//i.test(apiUrl)
  ) {
    throw new Error('Refusing to use a known production host for staging certification.');
  }
}

async function verifyTarget() {
  const data = await graphql(
    `query VerifyTarget($projectId: String!) {
      project(id: $projectId) {
        id
        name
        services { edges { node { id name } } }
      }
      environments(projectId: $projectId, first: 100) {
        edges { node { id name } }
      }
    }`,
    { projectId },
  );

  if (data.project?.id !== projectId || data.project?.name !== expectedProjectName) {
    throw new Error(
      `Railway project guard failed: expected ${expectedProjectName} (${projectId}), received ${data.project?.name ?? 'missing'}.`,
    );
  }

  const environment = data.environments?.edges
    ?.map((edge) => edge.node)
    .find((entry) => entry.id === environmentId);
  if (!environment || environment.name !== expectedEnvironmentName) {
    throw new Error(
      `Railway environment guard failed: expected ${expectedEnvironmentName} (${environmentId}).`,
    );
  }

  const service = data.project.services?.edges
    ?.map((edge) => edge.node)
    .find((entry) => entry.id === serviceId);
  if (!service || service.name !== expectedServiceName) {
    throw new Error(
      `Railway service guard failed: expected ${expectedServiceName} (${serviceId}).`,
    );
  }

  console.log(
    `Railway staging target verified: ${data.project.name}/${environment.name}/${service.name}.`,
  );
}

async function readVariables() {
  const data = await graphql(
    `query Variables($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    { projectId, environmentId, serviceId },
  );
  return data.variables || {};
}

function exportCertificationVars(variables) {
  const names = [
    'E2E_API_URL',
    'E2E_CLIENT_EMAIL',
    'E2E_CLIENT_PASSWORD',
    'E2E_VET_EMAIL',
    'E2E_VET_PASSWORD',
    'E2E_ADMIN_EMAIL',
    'E2E_ADMIN_PASSWORD',
  ];

  for (const name of names) {
    if (!variables[name]?.trim()) {
      throw new Error(`Railway staging variable ${name} is missing after synchronization.`);
    }
  }
  assertStagingUrl(variables.E2E_API_URL);

  for (const name of ['E2E_CLIENT_PASSWORD', 'E2E_VET_PASSWORD', 'E2E_ADMIN_PASSWORD']) {
    mask(variables[name]);
  }
  for (const name of names) writeEnv(name, variables[name]);

  console.log(`Staging certification variables loaded for ${variables.E2E_API_URL}.`);
  return variables;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function printDeploymentDiagnostics(deploymentId) {
  try {
    const data = await graphql(
      `query Diagnose($deploymentId: String!) {
        buildLogs(deploymentId: $deploymentId, limit: 80) { timestamp message severity }
        deploymentLogs(deploymentId: $deploymentId, limit: 80) { timestamp message severity }
      }`,
      { deploymentId },
    );

    console.error(`--- Railway staging diagnostics for ${deploymentId} ---`);
    for (const [label, rows] of [
      ['build', data.buildLogs || []],
      ['deploy', data.deploymentLogs || []],
    ]) {
      for (const row of rows.slice(-40)) {
        console.error(
          `${label} ${row.timestamp ?? ''} [${row.severity ?? 'unknown'}] ${row.message ?? ''}`,
        );
      }
    }
    console.error('--- end Railway staging diagnostics ---');
  } catch (error) {
    console.error(
      `Unable to fetch Railway diagnostics: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function waitForDeployment(deploymentId, timeoutMs = 15 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'UNKNOWN';
  while (Date.now() < deadline) {
    const data = await graphql(
      'query Deployment($id: String!) { deployment(id: $id) { id status } }',
      { id: deploymentId },
    );
    lastStatus = data.deployment?.status || 'UNKNOWN';
    if (lastStatus === 'SUCCESS') return;
    if (['FAILED', 'CRASHED', 'REMOVED'].includes(lastStatus)) {
      await printDeploymentDiagnostics(deploymentId);
      throw new Error(`Railway staging deployment ${deploymentId} ended with ${lastStatus}.`);
    }
    await wait(5_000);
  }
  await printDeploymentDiagnostics(deploymentId);
  throw new Error(`Railway staging deployment timed out with status ${lastStatus}.`);
}

async function waitForCandidate(apiUrl, expectedSha, timeoutMs = 5 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  const expectedPrefix = expectedSha.slice(0, 12).toLowerCase();
  let last = 'not reached';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/health/ready`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      const bodyText = await response.text();
      if (response.ok) {
        const body = JSON.parse(bodyText);
        const revision = String(body?.revision || '').toLowerCase();
        if (
          body?.status === 'ok' &&
          body?.checks?.database?.status === 'up' &&
          revision.startsWith(expectedPrefix)
        ) {
          console.log(`Staging readiness is serving candidate revision ${body.revision}.`);
          return;
        }
        last = `ready endpoint revision=${body?.revision ?? 'missing'} status=${body?.status ?? 'missing'}`;
      } else {
        last = `HTTP ${response.status}: ${bodyText.slice(0, 250)}`;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await wait(5_000);
  }

  throw new Error(`Staging API did not converge to candidate ${expectedPrefix}: ${last}`);
}

await verifyTarget();

if (mode === 'prepare') {
  const rotated = {
    ...fixtureEmails,
    E2E_CLIENT_PASSWORD: randomPassword(),
    E2E_VET_PASSWORD: randomPassword(),
    E2E_ADMIN_PASSWORD: randomPassword(),
    E2E_API_URL: 'https://${{RAILWAY_PUBLIC_DOMAIN}}/api',
    NVET_ALLOW_E2E_SEED: 'true',
    NVET_SEED_TARGET: 'staging',
  };

  for (const name of ['E2E_CLIENT_PASSWORD', 'E2E_VET_PASSWORD', 'E2E_ADMIN_PASSWORD']) {
    mask(rotated[name]);
  }

  await graphql(
    `mutation UpsertVariables($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }`,
    {
      input: {
        projectId,
        environmentId,
        serviceId,
        variables: rotated,
        skipDeploys: true,
      },
    },
  );
  console.log('Rotated staging-only CLIENT/VET/ADMIN fixture credentials without auto-deploy.');

  const deploy = await graphql(
    `mutation Deploy($commitSha: String!, $environmentId: String!, $serviceId: String!) {
      serviceInstanceDeployV2(commitSha: $commitSha, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    { commitSha: candidateSha, environmentId, serviceId },
  );
  const deploymentId = deploy.serviceInstanceDeployV2;
  if (!deploymentId) throw new Error('Railway did not return a staging deployment ID.');
  console.log(`Railway staging candidate deployment requested: ${deploymentId}.`);

  await waitForDeployment(deploymentId);
  console.log('Railway staging candidate deployment completed successfully.');

  const variables = exportCertificationVars(await readVariables());
  await waitForCandidate(variables.E2E_API_URL, candidateSha);
  writeEnv('STAGING_DEPLOYMENT_ID', deploymentId);
  writeEnv('RC_STAGING_SESSION_CURRENT', 'true');
  console.log('✅ Autonomous staging certification session prepared.');
} else {
  exportCertificationVars(await readVariables());
  console.log('✅ Existing staging certification session loaded from Railway.');
}
