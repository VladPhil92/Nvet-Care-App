import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const API_URL = 'https://backboard.railway.com/graphql/v2';
const token = process.env.RAILWAY_API_TOKEN;
const projectId = process.env.PROJECT_ID;
const frontendUrl = process.env.FRONTEND_URL;
const commitSha = process.env.GITHUB_SHA;
const stagingName = process.env.STAGING_ENVIRONMENT || 'staging';
const backendName = process.env.BACKEND_SERVICE || 'nvet-staging-backend';
const postgresName = process.env.POSTGRES_SERVICE || 'nvet-staging-postgres';
const repository = process.env.NVET_REPOSITORY || 'VladPhil92/Nvet-Care-App';

for (const [name, value] of Object.entries({
  RAILWAY_API_TOKEN: token,
  PROJECT_ID: projectId,
  FRONTEND_URL: frontendUrl,
  GITHUB_SHA: commitSha,
})) {
  if (!value) throw new Error(`${name} is required`);
}

if (!/^https:\/\/[^\s]+$/.test(frontendUrl)) {
  throw new Error('FRONTEND_URL must be an absolute HTTPS URL');
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

function secret(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

function writeGithubEnv(name, value) {
  if (!process.env.GITHUB_ENV) return;
  appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApi(apiUrl, timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'not reached';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/health/ready`, {
        signal: AbortSignal.timeout(8_000),
      });
      const body = await response.text();
      if (response.ok) return;
      last = `HTTP ${response.status}: ${body.slice(0, 250)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await wait(5_000);
  }
  throw new Error(`Staging API readiness timed out: ${last}`);
}

let createdEnvironmentId = null;
let completed = false;

async function cleanup() {
  if (!createdEnvironmentId || completed) return;
  console.error(`Cleaning incomplete isolated environment ${createdEnvironmentId}...`);
  try {
    await graphql(
      'mutation Delete($id: String!) { environmentDelete(id: $id) }',
      { id: createdEnvironmentId },
    );
    console.error('Incomplete staging environment removed. Production was not touched.');
  } catch (error) {
    console.error('Automatic staging cleanup failed:', error);
  }
}

try {
  const projectData = await graphql(
    'query Project($id: String!) { project(id: $id) { id name } environments(projectId: $id, first: 100) { edges { node { id name } } } }',
    { id: projectId },
  );

  if (projectData.project?.id !== projectId) {
    throw new Error('Workspace token cannot read the requested Railway project');
  }

  const existingStaging = projectData.environments.edges
    .map((edge) => edge.node)
    .find((environment) => environment.name === stagingName);
  if (existingStaging) {
    throw new Error(
      `Railway environment ${stagingName} already exists (${existingStaging.id}); refusing one-time bootstrap`,
    );
  }

  console.log(`Railway project verified: ${projectData.project.name}`);

  const envData = await graphql(
    'mutation CreateEnvironment($input: EnvironmentCreateInput!) { environmentCreate(input: $input) { id name } }',
    {
      input: {
        projectId,
        name: stagingName,
        ephemeral: false,
        skipInitialDeploys: true,
        stageInitialChanges: false,
        applyChangesInBackground: false,
      },
    },
  );
  createdEnvironmentId = envData.environmentCreate.id;
  console.log(`Created isolated environment: ${envData.environmentCreate.name}`);

  const postgresPassword = secret(32);
  const postgresUser = 'nvet_staging';
  const postgresDb = 'nvet_staging';

  const postgresData = await graphql(
    'mutation CreateService($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }',
    {
      input: {
        projectId,
        environmentId: createdEnvironmentId,
        name: postgresName,
        source: { image: 'postgres:16-alpine' },
        variables: {
          POSTGRES_USER: postgresUser,
          POSTGRES_PASSWORD: postgresPassword,
          POSTGRES_DB: postgresDb,
          PGDATA: '/var/lib/postgresql/data/pgdata',
        },
      },
    },
  );
  const postgresServiceId = postgresData.serviceCreate.id;
  console.log(`Created isolated PostgreSQL service: ${postgresData.serviceCreate.name}`);

  await graphql(
    'mutation CreateVolume($input: VolumeCreateInput!) { volumeCreate(input: $input) { id } }',
    {
      input: {
        projectId,
        environmentId: createdEnvironmentId,
        serviceId: postgresServiceId,
        mountPath: '/var/lib/postgresql/data',
      },
    },
  );

  await graphql(
    'mutation Redeploy($environmentId: String!, $serviceId: String!) { serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId) }',
    { environmentId: createdEnvironmentId, serviceId: postgresServiceId },
  );

  // Railway private-network DNS is scoped to the environment, so the backend
  // can reach this database without any TCP proxy or public database URL.
  const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@${postgresName}.railway.internal:5432/${postgresDb}?schema=public`;

  const backendVariables = {
    NODE_ENV: 'staging',
    APP_VERSION: '1.0.0-staging',
    PORT: '3000',
    FRONTEND_URL: frontendUrl,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: secret(32),
    JWT_REFRESH_SECRET: secret(32),
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    JWT_REFRESH_EXPIRES_DAYS: '7',
    TWO_FACTOR_ENCRYPTION_KEY: secret(32),
    SESSION_ID_SALT: secret(16),
    MAIL_DRIVER: 'console',
    LOG_LEVEL: 'info',
    NVET_CTG_IDENTITY_EXCHANGE_ENABLED: 'false',
    NVET_ALLOW_E2E_SEED: 'true',
    NVET_SEED_TARGET: 'staging',
  };

  const backendData = await graphql(
    'mutation CreateService($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }',
    {
      input: {
        projectId,
        environmentId: createdEnvironmentId,
        name: backendName,
        branch: 'main',
        source: { repo: repository },
        variables: backendVariables,
      },
    },
  );
  const backendServiceId = backendData.serviceCreate.id;
  console.log(`Created staging backend service: ${backendData.serviceCreate.name}`);

  await graphql(
    'mutation Configure($environmentId: String!, $serviceId: String!, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(environmentId: $environmentId, serviceId: $serviceId, input: $input) }',
    {
      environmentId: createdEnvironmentId,
      serviceId: backendServiceId,
      input: {
        builder: 'DOCKERFILE',
        dockerfilePath: '/Dockerfile.railway',
        railwayConfigFile: '/railway.json',
        rootDirectory: '/',
        preDeployCommand: 'npm run deploy:preflight --workspace backend',
        startCommand: 'node backend/scripts/railway-runtime-smoke.mjs',
        healthcheckPath: '/api/health/ready',
        healthcheckTimeout: 300,
        restartPolicyType: 'ON_FAILURE',
        restartPolicyMaxRetries: 5,
      },
    },
  );

  const domainData = await graphql(
    'mutation Domain($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { id domain } }',
    {
      input: {
        environmentId: createdEnvironmentId,
        serviceId: backendServiceId,
        targetPort: 3000,
      },
    },
  );
  const domain = domainData.serviceDomainCreate.domain;
  if (!domain) throw new Error('Railway did not return a public staging domain');
  const stagingApiUrl = `https://${domain}/api`;
  console.log(`Staging public API domain created: https://${domain}`);

  // Give the database image a brief head start before the backend predeploy
  // opens its first Prisma connection.
  await wait(15_000);

  const deploymentData = await graphql(
    'mutation Deploy($commitSha: String!, $environmentId: String!, $serviceId: String!) { serviceInstanceDeployV2(commitSha: $commitSha, environmentId: $environmentId, serviceId: $serviceId) }',
    {
      commitSha,
      environmentId: createdEnvironmentId,
      serviceId: backendServiceId,
    },
  );
  console.log(`Backend deployment requested: ${deploymentData.serviceInstanceDeployV2}`);

  await waitForApi(stagingApiUrl);
  console.log('Staging backend readiness passed.');

  writeGithubEnv('STAGING_API_URL', stagingApiUrl);
  writeGithubEnv('E2E_API_URL', stagingApiUrl);
  writeGithubEnv('STAGING_ENVIRONMENT_ID', createdEnvironmentId);
  writeGithubEnv('STAGING_BACKEND_SERVICE_ID', backendServiceId);
  writeGithubEnv('STAGING_POSTGRES_SERVICE_ID', postgresServiceId);

  completed = true;
  console.log('✅ Railway isolated staging bootstrap completed.');
} catch (error) {
  await cleanup();
  throw error;
}
