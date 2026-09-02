import { mkdirSync, writeFileSync } from 'node:fs';

const API_URL = 'https://backboard.railway.com/graphql/v2';
const token = process.env.RAILWAY_API_TOKEN;
const projectId = process.env.RAILWAY_PROJECT_ID;
const productionEnvironmentId = process.env.RAILWAY_PRODUCTION_ENVIRONMENT_ID;
const expectedProjectName = process.env.RAILWAY_EXPECTED_PROJECT_NAME || 'Nvet Care App';
const expectedPostgresService = process.env.RAILWAY_PRODUCTION_POSTGRES_SERVICE || 'Postgres';
const evidencePath = process.env.RC_BACKUP_EVIDENCE_PATH || '.artifacts/production-backup-evidence.json';

for (const [name, value] of Object.entries({
  RAILWAY_API_TOKEN: token,
  RAILWAY_PROJECT_ID: projectId,
  RAILWAY_PRODUCTION_ENVIRONMENT_ID: productionEnvironmentId,
})) {
  if (!value) throw new Error(`${name} is required`);
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

function unwrap(type) {
  let current = type;
  while (current?.ofType) current = current.ofType;
  return current;
}

function isRequired(type) {
  return type?.kind === 'NON_NULL';
}

function typeRef(type) {
  if (!type) return '';
  if (type.kind === 'NON_NULL') return `${typeRef(type.ofType)}!`;
  if (type.kind === 'LIST') return `[${typeRef(type.ofType)}]`;
  return type.name || '';
}

function escapeGraphqlString(value) {
  return JSON.stringify(String(value));
}

async function introspectType(name) {
  const data = await graphql(
    `query IntrospectType($name: String!) {
      __type(name: $name) {
        kind
        name
        fields {
          name
          args { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } }
          type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
        }
      }
    }`,
    { name },
  );
  return data.__type;
}

function scalarFields(type) {
  return (type?.fields || [])
    .filter((field) => {
      const base = unwrap(field.type);
      return ['SCALAR', 'ENUM'].includes(base?.kind) && (field.args || []).every((arg) => !isRequired(arg.type));
    })
    .map((field) => field.name)
    .filter((name) => !['secret', 'token', 'password'].some((word) => name.toLowerCase().includes(word)))
    .slice(0, 24);
}

async function selectionForField(field) {
  const direct = field.type;
  const base = unwrap(direct);
  if (!base) return '';
  if (['SCALAR', 'ENUM'].includes(base.kind)) return '';

  const type = await introspectType(base.name);
  const directScalars = scalarFields(type);
  if (directScalars.length) return `{ ${directScalars.join(' ')} }`;

  const edges = type?.fields?.find((candidate) => candidate.name === 'edges');
  if (edges) {
    const edgeType = await introspectType(unwrap(edges.type)?.name);
    const node = edgeType?.fields?.find((candidate) => candidate.name === 'node');
    if (node) {
      const nodeType = await introspectType(unwrap(node.type)?.name);
      const nodeScalars = scalarFields(nodeType);
      if (nodeScalars.length) return `{ edges { node { ${nodeScalars.join(' ')} } } }`;
    }
  }

  const nodes = type?.fields?.find((candidate) => candidate.name === 'nodes');
  if (nodes) {
    const nodeType = await introspectType(unwrap(nodes.type)?.name);
    const nodeScalars = scalarFields(nodeType);
    if (nodeScalars.length) return `{ nodes { ${nodeScalars.join(' ')} } }`;
  }

  throw new Error(`Unable to build a safe scalar selection for Railway field ${field.name}:${typeRef(field.type)}`);
}

function valueCount(value) {
  if (Array.isArray(value)) return value.length;
  if (Array.isArray(value?.edges)) return value.edges.length;
  if (Array.isArray(value?.nodes)) return value.nodes.length;
  if (value == null) return 0;
  if (typeof value === 'object') return Object.keys(value).length ? 1 : 0;
  return value ? 1 : 0;
}

async function executeVolumeInstanceQuery(field, volumeInstanceId) {
  const args = field.args || [];
  const requiredArgs = args.filter((arg) => isRequired(arg.type));
  const volumeArg = args.find((arg) => /volumeinstanceid/i.test(arg.name));
  if (!volumeArg) {
    throw new Error(`Railway field ${field.name} does not expose a volumeInstanceId argument`);
  }
  const unsupportedRequired = requiredArgs.filter((arg) => arg.name !== volumeArg.name);
  if (unsupportedRequired.length) {
    throw new Error(
      `Railway field ${field.name} requires unsupported args: ${unsupportedRequired.map((arg) => arg.name).join(', ')}`,
    );
  }

  const selection = await selectionForField(field);
  const query = `query ProductionVolumeEvidence { ${field.name}(${volumeArg.name}: ${escapeGraphqlString(volumeInstanceId)}) ${selection} }`;
  const data = await graphql(query);
  return data[field.name];
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

const schema = await graphql(`query BackupSchema {
  __schema {
    queryType {
      fields {
        name
        args { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } }
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
    }
  }
}`);

const queryFields = schema.__schema?.queryType?.fields || [];
const backupFields = queryFields.filter((field) => /backup/i.test(field.name));
const scheduleCandidates = backupFields.filter(
  (field) => /schedule/i.test(field.name) && (field.args || []).some((arg) => /volumeinstanceid/i.test(arg.name)),
);
const backupListCandidates = backupFields.filter(
  (field) =>
    !/schedule/i.test(field.name) &&
    (field.args || []).some((arg) => /volumeinstanceid/i.test(arg.name)) &&
    (/list/i.test(field.name) || /backup/i.test(field.name)),
);

if (!scheduleCandidates.length) {
  throw new Error(
    `Railway schema exposes no backup-schedule query scoped by volumeInstanceId. Backup-related query fields: ${backupFields
      .map((field) => field.name)
      .join(', ') || 'none'}`,
  );
}

const scheduleField =
  scheduleCandidates.find((field) => /volumeinstance.*backup.*schedule/i.test(field.name)) || scheduleCandidates[0];
const schedules = await executeVolumeInstanceQuery(scheduleField, postgres.id);
const scheduleCount = valueCount(schedules);

let backups = null;
let backupField = null;
if (backupListCandidates.length) {
  backupField =
    backupListCandidates.find((field) => field.name === 'volumeInstanceBackupList') || backupListCandidates[0];
  backups = await executeVolumeInstanceQuery(backupField, postgres.id);
}
const backupCount = valueCount(backups);

const evidence = {
  schemaVersion: 1,
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
    scheduleQuery: scheduleField.name,
    backupListQuery: backupField?.name || null,
  },
  scheduleCount,
  backupCount,
  schedules,
  backups,
  verdict: scheduleCount > 0 ? 'verified' : 'blocked',
  boundary:
    'Read-only provider metadata audit. It proves configured Railway volume-backup schedules only; it does not prove a restore drill.',
};

mkdirSync(evidencePath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(`Production PostgreSQL volume: ${postgres.volumeName} (${postgres.id})`);
console.log(`Railway backup schedule query: ${scheduleField.name}`);
console.log(`Configured backup schedules: ${scheduleCount}`);
console.log(`Visible backups: ${backupCount}`);
console.log(`Evidence written to ${evidencePath}`);

if (scheduleCount < 1) {
  throw new Error('No Railway automatic backup schedule is configured for the production PostgreSQL volume');
}
