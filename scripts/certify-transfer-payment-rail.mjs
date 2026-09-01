const required = [
  'E2E_API_URL',
  'E2E_CLIENT_EMAIL',
  'E2E_CLIENT_PASSWORD',
  'E2E_VET_EMAIL',
  'E2E_VET_PASSWORD',
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
];

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Missing required payment certification variable: ${name}`);
  }
}

if (process.env.NVET_PAYMENT_CERTIFICATION_TARGET !== 'staging') {
  throw new Error(
    'Transfer certification refused: NVET_PAYMENT_CERTIFICATION_TARGET must equal staging.',
  );
}

const apiUrl = process.env.E2E_API_URL.replace(/\/$/, '');
if (!/^https:\/\/[^\s]+\/api$/i.test(apiUrl)) {
  throw new Error('E2E_API_URL must be an absolute HTTPS URL ending in /api');
}

const parsedApi = new URL(apiUrl);
const forbiddenProductionHosts = new Set([
  'backend-production-a476.up.railway.app',
  'ctgone.com',
  'www.ctgone.com',
]);
if (forbiddenProductionHosts.has(parsedApi.hostname.toLowerCase())) {
  throw new Error(
    `Transfer certification refused: ${parsedApi.hostname} is a production host.`,
  );
}

const fixtureEmails = [
  process.env.E2E_CLIENT_EMAIL,
  process.env.E2E_VET_EMAIL,
  process.env.E2E_ADMIN_EMAIL,
].map((value) => value.trim().toLowerCase());
if (new Set(fixtureEmails).size !== fixtureEmails.length) {
  throw new Error('CLIENT, VET and ADMIN certification identities must be distinct.');
}

const PET_ID = '00000000-0000-4000-8000-000000000101';
const AMOUNT_COP = 50_000;
const runIdText = process.env.GITHUB_RUN_ID || String(Date.now());
const attemptText = process.env.GITHUB_RUN_ATTEMPT || '1';
const numericRunId = /^\d+$/.test(runIdText) ? BigInt(runIdText) : BigInt(Date.now());
const numericAttempt = /^\d+$/.test(attemptText) ? BigInt(attemptText) : 1n;
const runSeed = numericRunId * 31n + numericAttempt;
const certificateId = `${runIdText}-${attemptText}`;

const fetchWithTimeout = async (url, options = {}, timeoutMs = 20_000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const bodySnippet = async (response) =>
  (await response.text().catch(() => '')).slice(0, 500).replace(/\s+/g, ' ');

const readJson = async (label, response) => {
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${await bodySnippet(response)}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned non-JSON content`);
  }
};

const waitForStableReadiness = async ({
  timeoutMs = 60_000,
  intervalMs = 2_000,
  consecutiveRequired = 2,
} = {}) => {
  const deadline = Date.now() + timeoutMs;
  let consecutive = 0;
  let lastDetail = 'not reached';
  let lastHealthyPayload = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(
        `${apiUrl}/health/ready`,
        { headers: { accept: 'application/json' } },
        10_000,
      );

      if (!response.ok) {
        lastDetail = `HTTP ${response.status}: ${await bodySnippet(response)}`;
        consecutive = 0;
      } else {
        const payload = await response.json();
        const status = payload?.status ?? 'missing';
        const databaseStatus = payload?.checks?.database?.status ?? 'missing';

        if (status === 'ok' && databaseStatus === 'up') {
          consecutive += 1;
          lastHealthyPayload = payload;
          console.log(
            `Stable readiness sample ${consecutive}/${consecutiveRequired}: status=ok database=up revision=${payload?.revision ?? 'missing'}`,
          );
          if (consecutive >= consecutiveRequired) return lastHealthyPayload;
        } else {
          consecutive = 0;
          lastHealthyPayload = null;
          lastDetail = `status=${status} database=${databaseStatus}`;
          console.warn(`Readiness sample reset: ${lastDetail}`);
        }
      }
    } catch (error) {
      consecutive = 0;
      lastHealthyPayload = null;
      lastDetail = error instanceof Error ? error.message : String(error);
      console.warn(`Readiness sample failed: ${lastDetail}`);
    }

    if (Date.now() < deadline) await sleep(intervalMs);
  }

  throw new Error(
    `Staging readiness was not stable (${consecutiveRequired} consecutive healthy reads required within ${timeoutMs}ms): ${lastDetail}`,
  );
};

const authHeaders = (token, extra = {}) => ({
  accept: 'application/json',
  authorization: `Bearer ${token}`,
  'user-agent': 'nvet-transfer-certification/1.0',
  ...extra,
});

const login = async (label, expectedRole, email, password) => {
  const response = await fetchWithTimeout(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'nvet-transfer-certification/1.0',
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await readJson(`${label} login`, response);
  if (typeof payload?.accessToken !== 'string' || !payload.accessToken) {
    throw new Error(`${label} login did not return an access token`);
  }
  if (payload?.user?.role !== expectedRole) {
    throw new Error(
      `${label} login returned role ${payload?.user?.role ?? 'missing'}; expected ${expectedRole}`,
    );
  }
  return payload.accessToken;
};

const readinessPayload = await waitForStableReadiness();

const [clientToken, vetToken, adminToken] = await Promise.all([
  login(
    'CLIENT',
    'CLIENT',
    process.env.E2E_CLIENT_EMAIL,
    process.env.E2E_CLIENT_PASSWORD,
  ),
  login(
    'VET',
    'VET',
    process.env.E2E_VET_EMAIL,
    process.env.E2E_VET_PASSWORD,
  ),
  login(
    'ADMIN',
    'ADMIN',
    process.env.E2E_ADMIN_EMAIL,
    process.env.E2E_ADMIN_PASSWORD,
  ),
]);

const searchUrl = new URL(`${apiUrl}/vets`);
searchUrl.searchParams.set('specialty', 'Emergencias');
searchUrl.searchParams.set('availableNow', 'true');
searchUrl.searchParams.set('limit', '20');
const vetsPayload = await readJson(
  'E2E veterinarian discovery',
  await fetchWithTimeout(searchUrl, {
    headers: { accept: 'application/json', 'user-agent': 'nvet-transfer-certification/1.0' },
  }),
);
const vet = vetsPayload?.results?.find(
  (candidate) => candidate?.licenseNumber === 'NVET-E2E-0001',
);
if (!vet?.id || typeof vet.id !== 'string') {
  throw new Error('E2E veterinarian NVET-E2E-0001 was not discoverable with a profile id');
}

let appointmentId = null;
let appointmentDate = null;
let appointmentTime = null;
let cleanupToken = clientToken;

const cancelAppointment = async (reason) => {
  if (!appointmentId || !cleanupToken) return;
  const response = await fetchWithTimeout(`${apiUrl}/appointments/${appointmentId}`, {
    method: 'DELETE',
    headers: authHeaders(cleanupToken, { 'content-type': 'application/json' }),
    body: JSON.stringify({ reason }),
  }).catch(() => null);
  if (response && response.status !== 204 && !response.ok) {
    console.warn(`Certification cleanup returned HTTP ${response.status}`);
  }
};

try {
  for (let candidate = 0; candidate < 30; candidate += 1) {
    const candidateSeed = runSeed + BigInt(candidate);
    const daysAhead = 14 + Number(candidateSeed % 1200n);
    const hour = 8 + Number((candidateSeed / 1200n) % 15n);
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + daysAhead);
    const dateOnly = date.toISOString().slice(0, 10);
    const time = `${String(hour).padStart(2, '0')}:00`;

    const response = await fetchWithTimeout(`${apiUrl}/appointments`, {
      method: 'POST',
      headers: authHeaders(clientToken, {
        'content-type': 'application/json',
        'idempotency-key': `transfer-book-${certificateId}-${candidate}`.slice(0, 64),
      }),
      body: JSON.stringify({
        vetId: vet.id,
        petId: PET_ID,
        serviceType: 'Consulta general E2E - transferencia',
        date: `${dateOnly}T12:00:00.000Z`,
        time,
        address: 'Calle E2E Transfer Rail, Cartagena',
        amount: AMOUNT_COP,
        paymentMethod: 'TRANSFER',
        notes: `Automated staging transfer certification ${certificateId}`,
      }),
    });

    if (response.status === 409) continue;
    const appointment = await readJson('Create transfer certification appointment', response);
    appointmentId = appointment?.id;
    appointmentDate = dateOnly;
    appointmentTime = time;
    if (!appointmentId || appointment?.status !== 'PENDING') {
      throw new Error('Certification appointment did not enter PENDING state');
    }
    break;
  }

  if (!appointmentId) {
    throw new Error('Could not reserve a staging slot for transfer certification');
  }

  const payment = await readJson(
    'CLIENT initiate TRANSFER',
    await fetchWithTimeout(`${apiUrl}/payments/process`, {
      method: 'POST',
      headers: authHeaders(clientToken, {
        'content-type': 'application/json',
        'idempotency-key': `transfer-pay-${certificateId}`.slice(0, 64),
      }),
      body: JSON.stringify({
        appointmentId,
        paymentMethod: 'TRANSFER',
        amountCop: AMOUNT_COP,
      }),
    }),
  );

  if (
    !payment?.id ||
    payment.appointmentId !== appointmentId ||
    payment.paymentMethod !== 'TRANSFER' ||
    payment.status !== 'PENDING'
  ) {
    throw new Error('TRANSFER initiation did not produce the expected PENDING transaction');
  }
  const transactionId = payment.id;

  const pdfFixture = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj',
    `%% NVET staging transfer certification ${certificateId}`,
    `%% appointment=${appointmentId}`,
    `%% transaction=${transactionId}`,
    '%%EOF',
    '',
  ].join('\n');

  const form = new FormData();
  form.set('transferCode', `E2E-${certificateId}`.slice(0, 50));
  form.set('transferDate', new Date().toISOString());
  form.set(
    'file',
    new Blob([pdfFixture], { type: 'application/pdf' }),
    `nvet-transfer-${certificateId}.pdf`,
  );

  const verifying = await readJson(
    'VET submit transfer proof',
    await fetchWithTimeout(`${apiUrl}/payments/transactions/${transactionId}/verify-transfer`, {
      method: 'POST',
      headers: authHeaders(vetToken),
      body: form,
    }),
  );
  if (
    verifying?.id !== transactionId ||
    verifying?.status !== 'VERIFYING' ||
    typeof verifying?.hashOnchain !== 'string' ||
    !verifying.hashOnchain
  ) {
    throw new Error('VET transfer proof did not advance the transaction to VERIFYING');
  }

  const confirmed = await readJson(
    'ADMIN confirm transfer',
    await fetchWithTimeout(
      `${apiUrl}/payments/admin/transactions/${transactionId}/confirm-transfer`,
      {
        method: 'POST',
        headers: authHeaders(adminToken),
      },
    ),
  );
  if (
    confirmed?.id !== transactionId ||
    confirmed?.status !== 'CONFIRMED' ||
    !confirmed?.verifiedAt
  ) {
    throw new Error('ADMIN confirmation did not advance the transaction to CONFIRMED');
  }

  const finalTransaction = await readJson(
    'CLIENT read confirmed transaction',
    await fetchWithTimeout(`${apiUrl}/payments/transactions/${transactionId}`, {
      headers: authHeaders(clientToken),
    }),
  );
  if (
    finalTransaction?.id !== transactionId ||
    finalTransaction?.status !== 'CONFIRMED' ||
    finalTransaction?.paymentMethod !== 'TRANSFER'
  ) {
    throw new Error('Confirmed TRANSFER was not observable by the owning CLIENT');
  }

  const finalAppointment = await readJson(
    'CLIENT read confirmed appointment',
    await fetchWithTimeout(`${apiUrl}/appointments/${appointmentId}`, {
      headers: authHeaders(clientToken),
    }),
  );
  if (finalAppointment?.status !== 'CONFIRMED') {
    throw new Error('Transfer confirmation did not confirm the appointment');
  }

  console.log(
    JSON.stringify(
      {
        certification: 'TRANSFER_APPLICATION_LIFECYCLE',
        target: 'staging',
        apiHost: parsedApi.hostname,
        backendRevision: readinessPayload.revision ?? null,
        run: certificateId,
        appointmentId,
        transactionId,
        slot: `${appointmentDate} ${appointmentTime}`,
        lifecycle: ['PENDING', 'VERIFYING', 'CONFIRMED'],
        identities: ['CLIENT', 'VET', 'ADMIN'],
        applicationRailCertified: true,
        realFundsMovementProven: false,
        note: 'This certifies the application lifecycle only. A controlled real bank transfer remains required before paymentRailVerified may be marked verified.',
      },
      null,
      2,
    ),
  );

  await cancelAppointment(`E2E transfer certification ${certificateId} completed`);
  appointmentId = null;
} finally {
  await cancelAppointment(`E2E transfer certification ${certificateId} cleanup`);
}
