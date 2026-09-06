import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRailwayGraphqlClient } from './lib/railway-graphql-client.mjs';

const API_URL = 'https://backboard.railway.com/graphql/v2';
const token = process.env.RAILWAY_API_TOKEN;
const projectId = process.env.RAILWAY_PROJECT_ID;
const environmentId = process.env.RAILWAY_PRODUCTION_ENVIRONMENT_ID;
const serviceId = process.env.RAILWAY_PRODUCTION_SERVICE_ID;
const expectedProjectName = process.env.RAILWAY_EXPECTED_PROJECT_NAME || 'Nvet Care App';
const expectedEnvironmentName = process.env.RAILWAY_EXPECTED_ENVIRONMENT_NAME || 'production';
const expectedServiceName = process.env.RAILWAY_EXPECTED_SERVICE_NAME || 'backend';
const healthUrl =
  process.env.RAILWAY_PRODUCTION_HEALTH_URL ||
  'https://backend-production-a476.up.railway.app/api/health/ready';
const candidateSha = process.env.RC_CANDIDATE_SHA || process.env.GITHUB_SHA || null;
const evidencePath =
  process.env.RC_PRODUCTION_DEPLOYMENT_EVIDENCE_PATH ||
  '.artifacts/production-deployment-attestation.json';

for (const [name, value] of Object.entries({
  RAILWAY_API_TOKEN: token,
  RAILWAY_PROJECT_ID: projectId,
  RAILWAY_PRODUCTION_ENVIRONMENT_ID: environmentId,
  RAILWAY_PRODUCTION_SERVICE_ID: serviceId,
})) {
  if (!value?.trim()) throw new Error(`${name} is required`);
}

if (!/^https:\/\//i.test(healthUrl)) {
  throw new Error('RAILWAY_PRODUCTION_HEALTH_URL must be an absolute HTTPS URL');
}

const graphql = createRailwayGraphqlClient({
  apiUrl: API_URL,
  token,
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  requestTimeoutMs: 20_000,
});

function normalizeMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readCommitHash(meta) {
  const candidate = [meta.commitHash, meta.commitSha, meta.commitSHA, meta.sha]
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim();
  if (!candidate || !/^[0-9a-f]{40}$/i.test(candidate)) {
    throw new Error('Railway latest deployment metadata does not expose a valid 40-character commit hash');
  }
  return candidate.toLowerCase();
}

function writeGithubEnv(name, value) {
  if (!process.env.GITHUB_ENV) return;
  appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}

async function readHealthyRevision(maxAttempts = 5) {
  let lastError = 'not reached';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(healthUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      const text = await response.text();
      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${text.slice(0, 250)}`;
      } else {
        const body = JSON.parse(text);
        if (body?.status !== 'ok' || body?.checks?.database?.status !== 'up') {
          lastError = `readiness status=${body?.status ?? 'missing'} database=${body?.checks?.database?.status ?? 'missing'}`;
        } else {
          const revision = String(body?.revision || '').trim().toLowerCase();
          if (!/^[0-9a-f]{7,12}$/i.test(revision)) {
            throw new Error(`Production readiness returned an invalid revision: ${body?.revision ?? 'missing'}`);
          }
          return {
            revision,
            status: body.status,
            databaseStatus: body.checks.database.status,
            environment: body.environment ?? null,
            version: body.version ?? null,
          };
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw new Error(`Production readiness could not be attested after ${maxAttempts} attempts: ${lastError}`);
}

const data = await graphql(
  `query ProductionDeploymentAttestation($projectId: String!, $environmentId: String!, $serviceId: String!) {
    project(id: $projectId) {
      id
      name
      services { edges { node { id name } } }
    }
    environment(id: $environmentId) {
      id
      name
      projectId
    }
    serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
      id
      serviceId
      serviceName
      environmentId
      latestDeployment {
        id
        status
        createdAt
        meta
      }
    }
  }`,
  { projectId, environmentId, serviceId },
);

if (data.project?.id !== projectId || data.project?.name !== expectedProjectName) {
  throw new Error(
    `Railway project guard failed: expected ${expectedProjectName} (${projectId}), received ${data.project?.name ?? 'missing'}`,
  );
}
if (
  data.environment?.id !== environmentId ||
  data.environment?.projectId !== projectId ||
  data.environment?.name !== expectedEnvironmentName
) {
  throw new Error(
    `Railway environment guard failed: expected ${expectedEnvironmentName} (${environmentId})`,
  );
}

const projectService = data.project.services?.edges
  ?.map((edge) => edge.node)
  .find((service) => service.id === serviceId);
if (!projectService || projectService.name !== expectedServiceName) {
  throw new Error(
    `Railway service guard failed: expected ${expectedServiceName} (${serviceId}), received ${projectService?.name ?? 'missing'}`,
  );
}

const instance = data.serviceInstance;
if (
  !instance ||
  instance.serviceId !== serviceId ||
  instance.environmentId !== environmentId ||
  instance.serviceName !== expectedServiceName
) {
  throw new Error('Railway production service-instance guard failed');
}

const deployment = instance.latestDeployment;
if (!deployment?.id) throw new Error('Railway production service has no latest deployment');
if (deployment.status !== 'SUCCESS') {
  throw new Error(
    `Railway latest production deployment ${deployment.id} is ${deployment.status ?? 'UNKNOWN'}, expected SUCCESS`,
  );
}

const meta = normalizeMeta(deployment.meta);
const providerCommitSha = readCommitHash(meta);
const providerRevision = providerCommitSha.slice(0, 12);
const providerBranch =
  [meta.branch, meta.branchName, meta.sourceBranch].find(
    (value) => typeof value === 'string' && value.trim(),
  )?.trim() || null;

const health = await readHealthyRevision();
const liveMatchesProvider = health.revision === providerRevision;
if (!liveMatchesProvider) {
  throw new Error(
    `Production revision mismatch: Railway latest deployment=${providerRevision}, public readiness=${health.revision}`,
  );
}

const normalizedCandidate =
  candidateSha && /^[0-9a-f]{40}$/i.test(candidateSha) ? candidateSha.toLowerCase() : null;
const candidateMatchesProvider = normalizedCandidate === providerCommitSha;

const evidence = {
  schemaVersion: 1,
  evidenceType: 'railway-production-deployment-attestation',
  observedAt: new Date().toISOString(),
  project: { id: data.project.id, name: data.project.name },
  environment: { id: data.environment.id, name: data.environment.name },
  service: {
    id: serviceId,
    name: projectService.name,
    serviceInstanceId: instance.id,
  },
  providerDeployment: {
    id: deployment.id,
    status: deployment.status,
    createdAt: deployment.createdAt,
    commitSha: providerCommitSha,
    revision: providerRevision,
    branch: providerBranch,
  },
  liveReadiness: {
    url: healthUrl,
    status: health.status,
    databaseStatus: health.databaseStatus,
    revision: health.revision,
    environment: health.environment,
    version: health.version,
  },
  candidate: normalizedCandidate
    ? {
        sha: normalizedCandidate,
        matchesProviderDeployment: candidateMatchesProvider,
        note: candidateMatchesProvider
          ? 'The current candidate is the deployment serving production.'
          : 'The current candidate is not required to match production when Railway watch patterns legitimately skip a non-backend change.',
      }
    : null,
  checks: {
    latestDeploymentSuccessful: true,
    liveReadinessHealthy: true,
    liveRevisionMatchesProviderDeployment: liveMatchesProvider,
  },
  verdict: 'verified',
  boundary:
    'Read-only provider/live attestation. It proves that Railway latest successful production deployment metadata and the public readiness revision identify the same commit. It does not prove every current main/RC commit was deployed when watched-file rules correctly skip unrelated changes.',
};

mkdirSync(evidencePath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

writeGithubEnv('RC_PRODUCTION_DEPLOYMENT_ATTESTED', 'true');
writeGithubEnv('RC_PRODUCTION_DEPLOYMENT_SHA', providerCommitSha);
writeGithubEnv('RC_PRODUCTION_DEPLOYMENT_ID', deployment.id);

console.log(`Railway production deployment: ${deployment.id} (${deployment.status})`);
console.log(`Provider commit revision: ${providerRevision}`);
console.log(`Public readiness revision: ${health.revision}`);
console.log(`Current candidate matches provider deployment: ${candidateMatchesProvider}`);
console.log(`Evidence written to ${evidencePath}`);
console.log('✅ Railway production deployment ↔ live revision attestation verified.');
