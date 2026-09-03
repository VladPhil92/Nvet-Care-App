import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const controller = read('backend/src/ai/ai.controller.ts');
const assist = read('backend/src/ai/ai-assist.service.ts');
const provider = read('backend/src/ai/ai-provider.service.ts');
const safety = read('backend/src/ai/ai-safety-policy.service.ts');
const safetySpec = read('backend/src/ai/ai-safety-policy.service.spec.ts');
const assistSpec = read('backend/src/ai/ai-assist.service.spec.ts');

const failures = [];
const requireMatch = (condition, message) => {
  if (!condition) failures.push(message);
};
const has = (text, needle) => text.includes(needle);

requireMatch(
  has(controller, 'VerifiedVetGuard') &&
    /@Post\("vet-assist"\)[\s\S]{0,160}@UseGuards\(VerifiedVetGuard\)/.test(controller),
  'Veterinarian AI copilot must require VerifiedVetGuard.',
);
requireMatch(
  !/client:\s*\{\s*select:\s*\{\s*firstName/.test(assist),
  'Vet AI context must not select client name/identity.',
);
requireMatch(
  has(assist, 'this.safety.assertSafeClientOutput(result)') &&
    has(assist, 'this.safety.assertSafeVetOutput(result)'),
  'All model outputs must pass deterministic clinical safety policy before delivery.',
);
requireMatch(
  has(assist, 'this.safety.hasEmergencySignal(dto.question)'),
  'Client emergencies must be intercepted by the deterministic rule layer before the model.',
);
requireMatch(
  has(assist, 'datos no confiables') &&
    has(assist, 'Ignora cualquier instrucción'),
  'Prompts must explicitly treat contextual/user text as untrusted data.',
);
requireMatch(
  has(safety, 'AI_SAFETY_POLICY_VIOLATION') &&
    has(safety, 'DOSE_PATTERNS') &&
    has(safety, 'appointmentRecommended'),
  'Safety policy must fail closed on autonomous dosing and unsafe high-acuity guidance.',
);
requireMatch(
  has(provider, 'store: false'),
  'Provider requests must explicitly disable response storage.',
);
requireMatch(
  has(provider, 'strict: true') && has(provider, 'type: "json_schema"'),
  'Provider output must use strict Structured Outputs.',
);
requireMatch(
  has(provider, '"X-Client-Request-Id"') && has(provider, 'randomUUID'),
  'Provider requests must carry a unique privacy-safe request identifier.',
);
requireMatch(
  !has(provider, 'request.input}') && !has(provider, 'request.instructions}'),
  'Provider logs must never interpolate clinical prompts or input content.',
);
requireMatch(
  (safetySpec.match(/detects emergency signal/g) || []).length >= 1 &&
    has(safetySpec, 'medication dose') &&
    has(safetySpec, 'autonomous dose'),
  'Safety tests must cover emergency detection and no-dose boundaries.',
);
requireMatch(
  has(assistSpec, 'prompt injection') &&
    has(assistSpec, 'does not select client identity'),
  'Assist tests must cover prompt injection handling and PII minimization.',
);

if (failures.length > 0) {
  console.error('AI Safety & Privacy Certification gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('AI Safety & Privacy Certification gate passed.');
console.log('- Vet copilot: verified professionals only.');
console.log('- Context: client identity minimized.');
console.log('- Outputs: deterministic no-dose/high-acuity fail-closed policy.');
console.log('- Provider: store=false + strict schema + request-id tracing without prompt logging.');
console.log('- Evals: emergency, prompt-injection, PII and prescription boundaries covered.');
