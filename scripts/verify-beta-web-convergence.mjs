import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readText = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(await readText('docs/production/BETA_WEB_CONVERGENCE.json'));
const readme = await readText('README.md');
const integration = await readText('docs/CTG_ONE_INTEGRATION.md');
const phase = await readText('docs/PHASE_12G_CANONICAL_BETA_OPERATIONS_CONVERGENCE.md');
const controller = await readText('backend/src/beta/beta.controller.ts');
const readiness = await readText('backend/src/beta/beta-readiness.service.ts');

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.phase, '12G');
assert.equal(manifest.canonicalWebRepository, 'VladPhil92/ctg_one_website');
assert.equal(manifest.canonicalWebRoute, '/nvetcareapp/dashboard/beta');
assert.equal(manifest.backendPrefix, '/api/beta');
assert.equal(manifest.deprecatedLocalDashboardDeployable, false);

assert.equal(manifest.security.browserBearerTokenAllowed, false);
assert.equal(manifest.security.privilegedActingRoleHeadersAllowed, false);
assert.equal(manifest.security.clientModeAllowed, false);
assert.equal(manifest.security.vetTesterModeAllowed, false);
assert.equal(manifest.security.backendAuthorizationRemainsAuthoritative, true);
assert.equal(manifest.security.unknownBffPathsFailClosed, true);

assert.equal(manifest.promotionBoundary.productionEvidenceOnly, true);
assert.equal(manifest.promotionBoundary.authorizationMutatesProviderConfiguration, false);
assert.equal(manifest.promotionBoundary.commercialLaunchAuthorized, false);
assert.equal(manifest.promotionBoundary.bookingStillRevalidatesRuntimePrerequisites, true);

assert.match(readme, /dashboard\/.+deprecad[oa]/is, 'README must keep the local dashboard explicitly deprecated.');
assert.match(readme, /ctgone\.com\/nvetcareapp/, 'README must keep ctgone.com/nvetcareapp as the canonical web surface.');
assert.match(integration, /Nvet web surface.+ctgone\.com\/nvetcareapp/is, 'Integration contract must assign Nvet web authority to CTG One.');
assert.match(phase, /VladPhil92\/ctg_one_website#387/, 'Phase 12G must identify the paired canonical-web PR.');
assert.match(phase, /commercialLaunchAuthorized.+false/is, 'Phase 12G must preserve the commercial-launch boundary.');

const expectedControllerContracts = [
  ['readiness', /@Get\("readiness"\)[\s\S]*?@Roles\(UserRole\.ADMIN\)/],
  ['cohort read', /@Get\("cohort"\)[\s\S]*?@Roles\(UserRole\.ADMIN\)/],
  ['cohort invite', /@Post\("cohort\/invite"\)[\s\S]*?@Roles\(UserRole\.ADMIN\)/],
  ['cohort revoke', /@Post\("cohort\/:userId\/revoke"\)[\s\S]*?@Roles\(UserRole\.ADMIN\)/],
  ['activation read', /@Get\("activation"\)[\s\S]*?@Roles\(UserRole\.ADMIN\)/],
  ['activation authorize', /@Post\("activation\/authorize"\)[\s\S]*?@Roles\(UserRole\.ADMIN\)/],
  ['activation revoke', /@Post\("activation\/revoke"\)[\s\S]*?@Roles\(UserRole\.ADMIN\)/],
  ['evidence summary', /@Get\("evidence\/summary"\)[\s\S]*?@Roles\(UserRole\.ADMIN\)/],
  ['evidence history', /@Get\("evidence\/history"\)[\s\S]*?@Roles\(UserRole\.ADMIN\)/],
  ['evidence submit', /@Post\("evidence"\)[\s\S]*?@Roles\(UserRole\.ADMIN\)/],
];
for (const [name, pattern] of expectedControllerContracts) {
  assert.match(controller, pattern, `${name} must remain ADMIN-authorized in the Nvet backend.`);
}

assert.match(readiness, /commercialLaunchAuthorized:\s*false/, 'Backend readiness must never imply commercial launch approval.');
assert.match(readiness, /membershipSource:\s*"admin-control-plane"/, 'Cohort membership must remain controlled by the auditable admin control plane.');
assert.match(readiness, /operatorAuthorizationDoesNotToggleProviderConfiguration:\s*true/, 'Operator authorization must remain distinct from provider configuration.');

const requiredExternalGates = new Set([
  'productionBackupConfigured',
  'restoreDrillVerified',
  'paymentRailVerified',
  'cartagenaVetCoverageVerified',
  'clientCohortConfigured',
  'supportOwnerConfirmed',
  'privacyAndTermsReviewed',
  'rollbackDrillVerified',
  'rcPromoted',
]);
assert.deepEqual(new Set(manifest.externalEvidenceStillRequired), requiredExternalGates);

console.log('Phase 12G canonical beta web convergence: PASS');
