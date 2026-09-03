import fs from 'node:fs/promises';

const SERVICE_PATH = new URL('../mobile/src/services/beta.service.ts', import.meta.url);
const SELECTOR_PATH = new URL(
  '../mobile/src/components/booking/PaymentMethodSelector.tsx',
  import.meta.url,
);
const BACKEND_GATE_PATH = new URL(
  '../backend/src/beta/closed-beta-access.service.ts',
  import.meta.url,
);

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label}: missing required contract fragment: ${needle}`);
  }
}

function assertExcludes(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`${label}: forbidden contract fragment present: ${needle}`);
  }
}

const [service, selector, backendGate] = await Promise.all([
  fs.readFile(SERVICE_PATH, 'utf8'),
  fs.readFile(SELECTOR_PATH, 'utf8'),
  fs.readFile(BACKEND_GATE_PATH, 'utf8'),
]);

for (const endpoint of ["'/beta/policy'", "'/beta/legal'", "'/beta/legal/accept'"]) {
  assertIncludes(service, endpoint, 'mobile beta service');
}
assertIncludes(service, 'accepted: true', 'mobile beta service');

assertIncludes(selector, "mode === 'closed-beta'", 'payment selector');
assertIncludes(selector, 'betaConsentBlocking', 'payment selector');
assertIncludes(selector, "label={accepting ? 'Registrando aceptación…' : 'Acepto y continuar'}", 'payment selector');
assertIncludes(selector, 'disabled={isDisabled}', 'payment selector');
assertIncludes(selector, 'onPress={() => !isDisabled && onSelect(method.id)}', 'payment selector');
assertIncludes(selector, 'queryClient.setQueryData(BETA_LEGAL_QUERY_KEY, status)', 'payment selector');
assertIncludes(selector, 'No pudimos validar tu participación beta', 'payment selector');

// Consent must remain server-authoritative. Never persist a local "accepted" flag
// that could outlive a legal-version change or be edited independently of backend.
assertExcludes(selector, 'AsyncStorage', 'payment selector');
assertExcludes(service, 'AsyncStorage', 'mobile beta service');
assertExcludes(selector, 'setLegalAccepted(true)', 'payment selector');

// Defense in depth: mobile UX is not the security boundary. The backend must
// still enforce current acceptance before creating a booking in closed-beta mode.
assertIncludes(
  backendGate,
  'await this.legalConsent.assertCurrentAcceptance(clientId)',
  'backend booking gate',
);

console.log('Beta Consent UX contract verified.');
