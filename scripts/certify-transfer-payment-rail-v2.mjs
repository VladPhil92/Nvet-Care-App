import { createHash } from 'node:crypto';

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
  if (!process.env[name]?.trim()) throw new Error(`Missing ${name}`);
}
if (process.env.NVET_PAYMENT_CERTIFICATION_TARGET !== 'staging') {
  throw new Error('Payment certification is staging-only.');
}

const api = process.env.E2E_API_URL.replace(/\/$/, '');
const parsed = new URL(api);
if (parsed.protocol !== 'https:' || !parsed.pathname.endsWith('/api')) {
  throw new Error('E2E_API_URL must be HTTPS and end in /api.');
}
if (
  ['backend-production-a476.up.railway.app', 'ctgone.com', 'www.ctgone.com'].includes(
    parsed.hostname.toLowerCase(),
  )
) {
  throw new Error('Refusing to run synthetic payment certification on production.');
}

const request = async (path, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(`${api}${path}`, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const readJson = async (label, response) => {
  if (!response.ok) {
    throw new Error(
      `${label} failed (${response.status}): ${(await response.text().catch(() => '')).slice(0, 400)}`,
    );
  }
  return response.json();
};

const auth = (token, extra = {}) => ({
  accept: 'application/json',
  authorization: `Bearer ${token}`,
  'user-agent': 'nvet-transfer-certification/2.0',
  ...extra,
});

const login = async (label, expectedRole, email, password) => {
  const payload = await readJson(
    `${label} login`,
    await request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  );
  if (!payload?.accessToken || payload?.user?.role !== expectedRole) {
    throw new Error(`${label} authentication contract mismatch.`);
  }
  return payload.accessToken;
};

const ready = await readJson(
  'staging readiness',
  await request('/health/ready', { headers: { accept: 'application/json' } }),
);
if (ready?.status !== 'ok' || ready?.checks?.database?.status !== 'up') {
  throw new Error('Staging is not ready for payment certification.');
}

const [clientToken, vetToken, adminToken] = await Promise.all([
  login('CLIENT', 'CLIENT', process.env.E2E_CLIENT_EMAIL, process.env.E2E_CLIENT_PASSWORD),
  login('VET', 'VET', process.env.E2E_VET_EMAIL, process.env.E2E_VET_PASSWORD),
  login('ADMIN', 'ADMIN', process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD),
]);

const vetsUrl = new URL(`${api}/vets`);
vetsUrl.searchParams.set('specialty', 'Emergencias');
vetsUrl.searchParams.set('availableNow', 'true');
vetsUrl.searchParams.set('limit', '20');
const vets = await readJson('vet discovery', await fetch(vetsUrl));
const vet = vets?.results?.find((row) => row?.licenseNumber === 'NVET-E2E-0001');
if (!vet?.id) {
  throw new Error(
    'Verified staging veterinarian NVET-E2E-0001 is not discoverable. Check the Veterinary Trust seed.',
  );
}

const runId = `${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
const PET_ID = '00000000-0000-4000-8000-000000000101';
const AMOUNT = 50_000;
let appointmentId = null;

const cleanup = async () => {
  if (!appointmentId) return;
  await request(`/appointments/${appointmentId}`, {
    method: 'DELETE',
    headers: auth(clientToken, { 'content-type': 'application/json' }),
    body: JSON.stringify({ reason: `Transfer certification ${runId} cleanup` }),
  }).catch(() => undefined);
};

try {
  for (let candidate = 0; candidate < 30 && !appointmentId; candidate += 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 14 + candidate);
    const dateOnly = date.toISOString().slice(0, 10);
    const time = `${String(8 + (candidate % 15)).padStart(2, '0')}:00`;
    const response = await request('/appointments', {
      method: 'POST',
      headers: auth(clientToken, {
        'content-type': 'application/json',
        'idempotency-key': `fin-book-${runId}-${candidate}`.slice(0, 64),
      }),
      body: JSON.stringify({
        vetId: vet.id,
        petId: PET_ID,
        serviceType: 'Consulta general E2E - transferencia',
        date: `${dateOnly}T12:00:00.000Z`,
        time,
        address: 'Calle E2E Transfer Rail, Cartagena',
        amount: AMOUNT,
        paymentMethod: 'TRANSFER',
        notes: `Financial convergence certification ${runId}`,
      }),
    });
    if (response.status === 409) continue;
    const appointment = await readJson('create transfer appointment', response);
    if (appointment?.status !== 'PENDING' || !appointment?.id) {
      throw new Error('Transfer appointment did not enter PENDING.');
    }
    appointmentId = appointment.id;
  }
  if (!appointmentId) throw new Error('Could not reserve a certification slot.');

  const payment = await readJson(
    'initiate TRANSFER',
    await request('/payments/process', {
      method: 'POST',
      headers: auth(clientToken, {
        'content-type': 'application/json',
        'idempotency-key': `fin-pay-${runId}`.slice(0, 64),
      }),
      body: JSON.stringify({
        appointmentId,
        paymentMethod: 'TRANSFER',
        amountCop: AMOUNT,
      }),
    }),
  );
  if (!payment?.id || payment?.status !== 'PENDING') {
    throw new Error('TRANSFER initiation contract mismatch.');
  }
  const transactionId = payment.id;

  const pdf = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog>>endobj',
    `%% Nvet financial convergence ${runId}`,
    `%% transaction=${transactionId}`,
    '%%EOF',
    '',
  ].join('\n');
  const form = new FormData();
  form.set('transferCode', `E2E-${runId}`.slice(0, 50));
  form.set('transferDate', new Date().toISOString());
  form.set('file', new Blob([pdf], { type: 'application/pdf' }), `proof-${runId}.pdf`);

  const verifying = await readJson(
    'submit private transfer proof',
    await request(`/payments/transactions/${transactionId}/verify-transfer`, {
      method: 'POST',
      headers: auth(vetToken),
      body: form,
    }),
  );
  if (
    verifying?.status !== 'VERIFYING' ||
    !/^[a-f0-9]{64}$/i.test(String(verifying?.transferProofSha256 || '')) ||
    !verifying?.transferSubmittedAt
  ) {
    throw new Error('TRANSFER evidence did not persist its integrity contract.');
  }
  if (verifying?.transferProofStorageKey || verifying?.hashOnchain) {
    throw new Error('Private transfer storage identifier leaked to VET.');
  }

  const proofResponse = await request(
    `/payments/admin/transactions/${transactionId}/transfer-proof`,
    { headers: auth(adminToken) },
  );
  if (!proofResponse.ok) {
    throw new Error(`Admin proof read failed with ${proofResponse.status}.`);
  }
  const proofBytes = Buffer.from(await proofResponse.arrayBuffer());
  const proofHash = createHash('sha256').update(proofBytes).digest('hex');
  if (proofHash !== verifying.transferProofSha256) {
    throw new Error('Stored transfer proof failed SHA-256 integrity verification.');
  }

  const confirmed = await readJson(
    'confirm TRANSFER',
    await request(`/payments/admin/transactions/${transactionId}/confirm-transfer`, {
      method: 'POST',
      headers: auth(adminToken),
    }),
  );
  if (confirmed?.status !== 'CONFIRMED' || !confirmed?.verifiedAt) {
    throw new Error('TRANSFER did not enter CONFIRMED.');
  }
  if (confirmed?.transferProofStorageKey || confirmed?.hashOnchain) {
    throw new Error('Private transfer storage identifier leaked to ADMIN response.');
  }

  const clientTransaction = await readJson(
    'client transaction read',
    await request(`/payments/transactions/${transactionId}`, {
      headers: auth(clientToken),
    }),
  );
  if (clientTransaction?.status !== 'CONFIRMED') {
    throw new Error('CLIENT cannot observe confirmed transfer state.');
  }
  if (clientTransaction?.transferProofStorageKey || clientTransaction?.hashOnchain) {
    throw new Error('Private transfer storage identifier leaked to CLIENT.');
  }

  const appointment = await readJson(
    'client appointment read',
    await request(`/appointments/${appointmentId}`, { headers: auth(clientToken) }),
  );
  if (appointment?.status !== 'CONFIRMED') {
    throw new Error('Confirmed transfer did not confirm the appointment.');
  }

  console.log(
    JSON.stringify(
      {
        certification: 'TRANSFER_APPLICATION_LIFECYCLE_V2',
        target: 'staging',
        revision: ready?.revision ?? null,
        transactionId,
        appointmentId,
        lifecycle: ['PENDING', 'VERIFYING', 'CONFIRMED'],
        privateEvidenceIntegrityCertified: true,
        privateStorageRedactionCertified: true,
        applicationRailCertified: true,
        realFundsMovementProven: false,
      },
      null,
      2,
    ),
  );
} finally {
  await cleanup();
}
