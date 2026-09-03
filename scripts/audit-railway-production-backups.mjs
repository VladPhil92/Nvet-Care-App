import { mkdirSync, writeFileSync } from 'node:fs';

const API_URL = 'https://backboard.railway.com/graphql/v2';
const token = process.env.RAILWAY_API_TOKEN;
const projectId = process.env.RAILWAY_PROJECT_ID;
const productionEnvironmentId = process.env.RAILWAY_PRODUCTION_ENVIRONMENT_ID;
const expectedProjectName = process.env.RAILWAY_EXPECTED_PROJECT_NAME || 'Nvet Care App';
const expectedPostgresService = process.env.RAILWAY_PRODUCTION_POSTGRES_SERVICE || 'Postgres';
const evidencePath = process.env.RC_BACKUP_EVIDENCE_PATH || '.artifacts/production-backup-evidence.json';
const maxBackupAgeHours = parsePositiveNumber(
  process.env.RAILWAY_MAX_BACKUP_AGE_HOURS,
  48,
  'RAILWAY_MAX_BACKUP_AGE_HOURS',
);
const minRetentionHours = parsePositiveNumber(
  process.env.RAILWAY_MIN_BACKUP_RETENTION_HOURS,
  168,
  'RAILWAY_MIN_BACKUP_RETENTION_HOURS',
);

for (const [name, value] of Object.entries({
  RAILWAY_API_TOKEN: token,
  RAILWAY_PROJECT_ID: projectId,
  RAILWAY_PRODUCTION_ENVIRONMENT_ID: productionEnvironmentId,
})) {
  if (!value) throw new Error(`${name} is required`);
}

function parsePositiveNumber(raw, fallback, name) {
  if (raw == null || String(raw).trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
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
    throw new Error(`Railway returned non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!response.ok || payload.errors?.length) {
    const errors =
      payload.errors?.map((error) => error.message).filter(Boolean).join('; ') || text.slice(0, 300);
    throw new Error(`Railway GraphQL failed (HTTP ${response.status}): ${errors}`);
  }

  return payload.data;
}

const projectData = await graphql(
  `query ProductionStorage($id: String!) {
    project(id: $id) {
      id
      name
      services { edges { node { id name } } }
      volumes {
        edges {
          node {
            id
            name
            volumeInstances {
              edges {
                node { id serviceId environmentId mountPath }
              }
            }
          }
        }
      }
    }
  }`,
  { id: projectId },
);

const project = projectData.project;
if (project?.id !== projectId) throw new Error('Railway token cannot read the requested project');
if (project.name !== expectedProjectName) {
  throw new Error(`Railway project-name guard failed: expected ${expectedProjectName}, received ${project.name}`);
}

const serviceNames = new Map(
  (project.services?.edges || []).map(({ node }) => [node.id, node.name]),
);
const productionInstances = [];
for (const { node: volume } of project.volumes?.edges || []) {
  for (const { node: instance } of volume.volumeInstances?.edges || []) {
    if (instance.environmentId !== productionEnvironmentId) continue;
    productionInstances.push({
      ...instance,
      volumeId: volume.id,
      volumeName: volume.name,
      serviceName: serviceNames.get(instance.serviceId) || null,
    });
  }
}

const postgresCandidates = productionInstances.filter((instance) => {
  const serviceName = String(instance.serviceName || '').toLowerCase();
  const mountPath = String(instance.mountPath || '').toLowerCase();
  return (
    serviceName === expectedPostgresService.toLowerCase() ||
    serviceName.includes('postgres') ||
    mountPath.includes('/postgresql/data')
  );
});

if (postgresCandidates.length !== 1) {
  throw new Error(
    `Expected exactly one production PostgreSQL volume instance, found ${postgresCandidates.length}: ${postgresCandidates
      .map((candidate) => `${candidate.serviceName ?? 'unknown'}:${candidate.id}`)
      .join(', ')}`,
  );
}

const postgres = postgresCandidates[0];
const variables = { volumeInstanceId: postgres.id };

const backupData = await graphql(
  `query volumeInstanceBackupList($volumeInstanceId: String!) {
    volumeInstanceBackupList(volumeInstanceId: $volumeInstanceId) {
      id
      name
      createdAt
      expiresAt
      usedMB
      referencedMB
    }
  }`,
  variables,
);

const scheduleData = await graphql(
  `query volumeInstanceBackupScheduleList($volumeInstanceId: String!) {
    volumeInstanceBackupScheduleList(volumeInstanceId: $volumeInstanceId) {
      id
      name
      cron
      kind
      retentionSeconds
      createdAt
    }
  }`,
  variables,
);

const backups = [...(backupData.volumeInstanceBackupList || [])].sort(
  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
);
const schedules = scheduleData.volumeInstanceBackupScheduleList || [];
const scheduleCount = schedules.length;
const backupCount = backups.length;
const latestBackup = backups[0] || null;
const latestBackupAgeHours = latestBackup
  ? (Date.now() - new Date(latestBackup.createdAt).getTime()) / 3_600_000
  : null;
const latestBackupFresh =
  latestBackupAgeHours !== null &&
  latestBackupAgeHours >= 0 &&
  latestBackupAgeHours <= maxBackupAgeHours;
const requiredRetentionSeconds = minRetentionHours * 3600;
const retentionSatisfied = schedules.some(
  (schedule) => Number(schedule.retentionSeconds || 0) >= requiredRetentionSeconds,
);
const verdict =
  scheduleCount > 0 && backupCount > 0 && latestBackupFresh && retentionSatisfied
    ? 'verified'
    : 'blocked';

const evidence = {
  schemaVersion: 2,
  evidenceType: 'railway-production-volume-backup-audit',
  observedAt: new Date().toISOString(),
  project: { id: project.id, name: project.name },
  environmentId: productionEnvironmentId,
  postgres: {
    serviceId: postgres.serviceId,
    serviceName: postgres.serviceName,
    volumeId: postgres.volumeId,
    volumeName: postgres.volumeName,
    volumeInstanceId: postgres.id,
    mountPath: postgres.mountPath,
  },
  railwaySchema: {
    scheduleQuery: 'volumeInstanceBackupScheduleList',
    backupListQuery: 'volumeInstanceBackupList',
  },
  policy: {
    maxBackupAgeHours,
    minRetentionHours,
  },
  scheduleCount,
  backupCount,
  latestBackup: latestBackup
    ? {
        id: latestBackup.id,
        name: latestBackup.name,
        createdAt: latestBackup.createdAt,
        expiresAt: latestBackup.expiresAt,
        usedMB: latestBackup.usedMB,
        referencedMB: latestBackup.referencedMB,
        ageHours: Number(latestBackupAgeHours.toFixed(2)),
      }
    : null,
  checks: {
    scheduleConfigured: scheduleCount > 0,
    visibleBackupExists: backupCount > 0,
    latestBackupFresh,
    retentionSatisfied,
  },
  schedules,
  backups,
  verdict,
  boundary:
    'Read-only provider metadata audit. It proves configured Railway volume-backup schedules and a recent retained backup; it does not prove a restore drill.',
};

mkdirSync(evidencePath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(`Production PostgreSQL volume: ${postgres.volumeName} (${postgres.id})`);
console.log(`Configured backup schedules: ${scheduleCount}`);
console.log(`Visible backups: ${backupCount}`);
console.log(
  `Latest backup age: ${latestBackupAgeHours === null ? 'n/a' : `${latestBackupAgeHours.toFixed(2)}h`}`,
);
console.log(`Retention >= ${minRetentionHours}h: ${retentionSatisfied}`);
console.log(`Evidence written to ${evidencePath}`);

if (scheduleCount < 1) {
  throw new Error('No Railway automatic backup schedule is configured for the production PostgreSQL volume');
}
if (backupCount < 1) {
  throw new Error('Railway backup schedule exists, but no provider backup is visible yet');
}
if (!latestBackupFresh) {
  throw new Error(
    `Latest Railway backup exceeds the ${maxBackupAgeHours}h freshness policy`,
  );
}
if (!retentionSatisfied) {
  throw new Error(
    `No Railway backup schedule satisfies the minimum ${minRetentionHours}h retention policy`,
  );
}
