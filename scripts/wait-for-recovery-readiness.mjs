const repo = process.env.GITHUB_REPOSITORY || 'VladPhil92/Nvet-Care-App';
const candidate = process.env.RC_CANDIDATE_SHA || process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;
const timeoutMs = Number(process.env.RECOVERY_WAIT_TIMEOUT_MS || 1_200_000);
const pollMs = Number(process.env.RECOVERY_POLL_INTERVAL_MS || 15_000);

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!/^[0-9a-f]{40}$/i.test(candidate || '')) {
  fail('RC_CANDIDATE_SHA or GITHUB_SHA must be a full 40-character commit SHA.');
}
if (!token) {
  fail('GITHUB_TOKEN is required to wait for recovery evidence.');
}
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 1_500_000) {
  fail('RECOVERY_WAIT_TIMEOUT_MS must be between 1 and 1500000 milliseconds.');
}
if (!Number.isFinite(pollMs) || pollMs < 5_000 || pollMs > 60_000) {
  fail('RECOVERY_POLL_INTERVAL_MS must be between 5000 and 60000 milliseconds.');
}

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};

const startedAt = Date.now();
let lastState = 'not-created';

async function loadRuns() {
  const url = `https://api.github.com/repos/${repo}/actions/runs?branch=main&per_page=100`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub Actions API returned HTTP ${response.status}.`);
  }
  const payload = await response.json();
  return Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
}

while (Date.now() - startedAt < timeoutMs) {
  let runs;
  try {
    runs = await loadRuns();
  } catch (error) {
    console.warn(`Recovery evidence query failed transiently: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    continue;
  }

  const exact = runs.find(
    (run) =>
      run?.name === 'Nvet Recovery Readiness' &&
      run.head_branch === 'main' &&
      run.head_sha === candidate,
  );

  if (!exact) {
    if (lastState !== 'not-created') lastState = 'not-created';
    console.log(`Waiting for Nvet Recovery Readiness to start for ${candidate.slice(0, 12)}...`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    continue;
  }

  lastState = `${exact.status}/${exact.conclusion ?? 'none'}`;
  if (exact.status === 'completed') {
    if (exact.conclusion !== 'success') {
      fail(`Recovery run ${exact.id} completed with conclusion=${exact.conclusion ?? 'none'} for the exact candidate.`);
    }
    console.log(`✅ Exact candidate recovery rehearsal verified: run=${exact.id} sha=${candidate.slice(0, 12)}.`);
    process.exit(0);
  }

  console.log(`Recovery run ${exact.id} is ${exact.status}; waiting for completion...`);
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}

fail(`Timed out waiting for successful Nvet Recovery Readiness for ${candidate.slice(0, 12)}; lastState=${lastState}.`);
