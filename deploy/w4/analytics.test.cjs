const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');

process.env.AP_ENVIRONMENT = 'test';
process.env.AP_DB_TYPE = 'PGLITE';
process.env.AP_REDIS_TYPE = 'MEMORY';
process.env.AP_EDITION = 'ce';
process.env.AP_JWT_SECRET = randomBytes(32).toString('hex');
process.env.AP_ENCRYPTION_KEY = randomBytes(16).toString('hex');
process.env.AP_TELEMETRY_ENABLED = 'false';
const api = createRequire(path.resolve('packages/server/api/package.json'));
const load = name => api(`./dist/src/app/${name}`);
const { apId } = api('@activepieces/core-utils');
const { UserStatus, PlatformRole } = api('@activepieces/shared');
const { databaseConnection } = load('database/database-connection');
const { repoFactory } = load('core/db/repo-factory');
const { userRepo } = load('user/user-service');
const { platformRepo } = load('platform/platform.service');
const { projectRepo } = load('project/project-repo');
const { flowRepo } = load('flows/flow/flow.repo');
const identities = repoFactory(load('authentication/user-identity/user-identity-entity').UserIdentityEntity);
const versions = repoFactory(load('flows/flow-version/flow-version-entity').FlowVersionEntity);
const runs = repoFactory(load('flows/flow-run/flow-run-entity').FlowRunEntity);

async function tenant({ name, count }) {
  const identity = await identities().save({ id: apId(), email: `${name}@example.invalid`, password: 'not-a-login-password', firstName: name, lastName: 'Test', provider: 'EMAIL', verified: true });
  const owner = await userRepo().save({ id: apId(), identityId: identity.id, platformId: null, platformRole: PlatformRole.ADMIN, status: UserStatus.ACTIVE });
  const platform = await platformRepo().save({ id: apId(), ownerId: owner.id, name, primaryColor: '#087f5b', logoIconUrl: '/w4-brand/icon.svg', fullLogoUrl: '/w4-brand/full-logo.svg', favIconUrl: '/w4-brand/icon.svg', emailAuthEnabled: true, enforceAllowedAuthDomains: false, allowedAuthDomains: [], federatedAuthProviders: { saml: null }, pinnedPieces: [] });
  await userRepo().update({ id: owner.id, identityId: identity.id }, { platformId: platform.id });
  const project = await projectRepo().save({ id: apId(), ownerId: owner.id, platformId: platform.id, displayName: name, type: 'PERSONAL', icon: { color: '#087f5b' } });
  const flow = await flowRepo().save({ id: apId(), projectId: project.id, ownerId: owner.id, externalId: apId(), status: 'ENABLED' });
  const version = await versions().save({ id: apId(), flowId: flow.id, displayName: 'Test flow', valid: false, state: 'DRAFT', connectionIds: [], agentIds: [], notes: [] });
  const now = new Date();
  for (let index = 0; index < count; index++) {
    await runs().save({ id: apId(), projectId: project.id, flowId: flow.id, flowVersionId: version.id, environment: 'PRODUCTION', status: index === 0 ? 'FAILED' : 'SUCCEEDED', startTime: new Date(now.getTime() - 3000), finishTime: new Date(now.getTime() - 1000), stepsCount: 1 });
  }
  const jwt = api('jsonwebtoken');
  const token = jwt.sign({ id: owner.id, type: 'USER', platform: { id: platform.id }, tokenVersion: null }, process.env.AP_JWT_SECRET, { expiresIn: '5m', issuer: 'activepieces', keyid: '1' });
  return { platform, project, owner, token, flow, version };
}

test('W4 analytics uses real queries and authentication for two independent tenants', async t => {
  const database = databaseConnection();
  await database.initialize();
  const app = api('fastify')({ logger: false });
  const { validatorCompiler, serializerCompiler } = api('fastify-type-provider-zod');
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(load('helper/error-handler').errorHandler);
  app.addHook('preHandler', load('core/security/v2/authn/authentication-middleware').authenticationMiddleware);
  app.addHook('preHandler', load('core/security/v2/authz/authorization-middleware').authorizationMiddleware);
  await app.register(load('w4/w4-module').w4Module);
  try {
    const a = await tenant({ name: 'customer-a', count: 3 });
    const b = await tenant({ name: 'customer-b', count: 5 });
    const parent = await runs().findOneByOrFail({ projectId: a.project.id });
    const baseRun = { projectId: a.project.id, flowId: a.flow.id, flowVersionId: a.version.id, environment: 'PRODUCTION', status: 'SUCCEEDED', stepsCount: 1 };
    await runs().save({ ...baseRun, id: apId(), environment: 'TESTING' });
    await runs().save({ ...baseRun, id: apId(), parentRunId: parent.id });
    await runs().save({ ...baseRun, id: apId(), created: new Date(Date.now() - 91 * 86_400_000) });
    const request = ({ token, query = '' }) => app.inject({ method: 'GET', url: `/v1/w4/analytics${query}`, headers: token ? { authorization: `Bearer ${token}` } : {} });
    await t.test('unauthenticated requests are denied', async () => {
      const response = await request({});
      assert.ok([401, 403].includes(response.statusCode), response.body);
    });
    await t.test('customer A sees only its own executions and their actual duration', async () => {
      const response = await request({ token: a.token });
      assert.equal(response.statusCode, 200, response.body);
      const result = response.json();
      assert.equal(result.organizationId, a.platform.id);
      assert.equal(result.runs.total, 3);
      assert.equal(result.runs.failed, 1);
      assert.equal(result.runs.succeeded, 2);
      assert.equal(result.runs.successRate, 2 / 3);
      assert.equal(result.averageDurationMs, 2000);
      assert.equal(result.projects, 1);
      assert.equal(result.flows, 1);
      assert.equal(result.activeUsers, 1);
      assert.equal(result.dailyRuns.reduce((sum, row) => sum + row.count, 0), 3);
    });
    await t.test('customer B sees its independent totals', async () => {
      const response = await request({ token: b.token });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().runs.total, 5);
    });
    await t.test('another customer project is rejected', async () => {
      const response = await request({ token: a.token, query: `?projectId=${b.project.id}` });
      assert.equal(response.statusCode, 404, response.body);
    });
    await t.test('a client cannot supply an organization scope', async () => {
      const response = await request({ token: a.token, query: `?platformId=${b.platform.id}` });
      assert.equal(response.statusCode, 400, response.body);
    });
    await t.test('ranges are bounded to 90 days', async () => {
      for (const days of [0, 91, -1, 'abc']) {
        const response = await request({ token: a.token, query: `?days=${days}` });
        assert.equal(response.statusCode, 400, response.body);
      }
    });
    await t.test('an empty project returns zero runs and no invented success rate', async () => {
      const emptyProject = await projectRepo().save({ id: apId(), ownerId: a.owner.id, platformId: a.platform.id, displayName: 'Empty project', type: 'PERSONAL', icon: { color: '#087f5b' } });
      const response = await request({ token: a.token, query: `?projectId=${emptyProject.id}` });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().runs.total, 0);
      assert.equal(response.json().runs.successRate, null);
      assert.equal(response.json().averageDurationMs, null);
    });
    await t.test('a token with inconsistent organization membership cannot read analytics', async () => {
      const token = api('jsonwebtoken').sign({ id: a.owner.id, type: 'USER', platform: { id: b.platform.id }, tokenVersion: null }, process.env.AP_JWT_SECRET, { expiresIn: '5m', issuer: 'activepieces', keyid: '1' });
      const response = await request({ token });
      assert.equal(response.statusCode, 403, response.body);
    });
    await t.test('ordinary members cannot read organization analytics', async () => {
      await userRepo().update({ id: a.owner.id, platformId: a.platform.id }, { platformRole: 'MEMBER' });
      assert.equal((await request({ token: a.token })).statusCode, 403);
      await userRepo().update({ id: a.owner.id, platformId: a.platform.id }, { platformRole: 'ADMIN' });
    });
    await t.test('suspending a user revokes access with an existing token', async () => {
      await userRepo().update({ id: a.owner.id, platformId: a.platform.id }, { status: UserStatus.INACTIVE });
      const response = await request({ token: a.token });
      assert.ok([401, 403].includes(response.statusCode), response.body);
    });
  } finally {
    await app.close();
    await database.destroy();
  }
});
