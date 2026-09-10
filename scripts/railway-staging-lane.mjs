import { createRailwayGraphqlClient } from './lib/railway-graphql-client.mjs';

const API_URL = 'https://backboard.railway.com/graphql/v2';

const token = process.env.RAILWAY_API_TOKEN;
const projectId = process.env.RAILWAY_PROJECT_ID;
const environmentId = process.env.RAILWAY_STAGING_ENVIRONMENT_ID;
const serviceId = process.env.RAILWAY_STAGING_SERVICE_ID;
const candidateSha = process.env.RC_CANDIDATE_SHA || process.env.GITHUB_SHA || '';

const timeoutMs = Number(process.env.NVET_STAGING_LANE_TIMEOUT_MS || 10 * 60_000);
const pollMs = Number(process.env.NVET_STAGING_LANE_POLL_MS || 5_000);

const required = {
  RAILWAY_API_TOKEN: token,
  RAILWAY_PROJECT_ID: projectId,
  RAILWAY_STAGING_ENVIRONMENT_ID: environmentId,
  RAILWAY_STAGING_SERVICE_ID: serviceId,
};

for (const [name, value] of Object.entries(required)) {
  if (!value?.trim()) throw new Error(`${name} is required`);
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error('NVET_STAGING_LANE_TIMEOUT_MS must be a positive number.');
}
if (!Number.isFinite(pollMs) || pollMs < 1_000) {
  throw new Error('NVET_STAGING_LANE_POLL_MS must be at least 1000ms.');
}

const graphql = createRailwayGraphqlClient({
  apiUrl: API_URL,
  token,
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  requestTimeoutMs: 20_000,
});

const ACTIVE_STATUSES = new Set([
  'WAITING',
  'NEEDS_APPROVAL',
  'QUEUED',
  'INITIALIZING',
  'BUILDING',
  'DEPLOYING',
  'REMOVING',
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortSha(value) {
  return /^[0-9a-f]{7,40}$/i.test(value || '') ? value.slice(0, 12) : 'unknown';
}

async function listRecentDeployments() {
  const data = await graphql(
    `query StagingLane($projectId: String!, $environmentId: String!, $serviceId: String!) {
      deployments(
        input: {
          projectId: $projectId
          environmentId: $environmentId
          serviceId: $serviceId
        }
        first: 20
      ) {
        edges {
          node {
            id
            status
            createdAt
            meta
          }
        }
      }
    }`,
    { projectId, environmentId, serviceId },
  );

  return (data.deployments?.edges || []).map((edge) => edge.node).filter(Boolean);
}

const deadline = Date.now() + timeoutMs;
let previousFingerprint = '';

while (Date.now() < deadline) {
  const deployments = await listRecentDeployments();
  const active = deployments.filter((deployment) => ACTIVE_STATUSES.has(deployment.status));

  if (active.length === 0) {
    const latest = deployments[0];
    console.log(
      latest
        ? `✅ Railway staging lane is idle. Latest=${latest.id} status=${latest.status}; candidate=${shortSha(candidateSha)}.`
        : `✅ Railway staging lane is idle with no prior deployments; candidate=${shortSha(candidateSha)}.`,
    );
    process.exit(0);
  }

  const fingerprint = active.map((deployment) => `${deployment.id}:${deployment.status}`).join(',');
  if (fingerprint !== previousFingerprint) {
    console.log(
      `⏳ Waiting for Railway staging lane: ${active
        .map((deployment) => `${deployment.id.slice(0, 8)}=${deployment.status}`)
        .join(', ')}; candidate=${shortSha(candidateSha)}.`,
    );
    previousFingerprint = fingerprint;
  }

  await sleep(pollMs);
}

const remaining = (await listRecentDeployments()).filter((deployment) =>
  ACTIVE_STATUSES.has(deployment.status),
);
throw new Error(
  `Railway staging lane did not become idle within ${timeoutMs}ms. Active deployments: ${remaining
    .map((deployment) => `${deployment.id}:${deployment.status}`)
    .join(', ') || 'unknown'}.`,
);
