const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const base = process.env.W4_TEST_URL || 'http://127.0.0.1/api';
const statePath = '/tmp/w4-test-users.json';
const results = [];
let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath)) : {};
function save() { fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 }); }
async function request(method, route, body, actor, expected = [200, 201, 204]) {
  const response = await fetch(base + route, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(actor ? { authorization: `Bearer ${actor.token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!expected.includes(response.status)) throw new Error(`${method} ${route.split('?')[0]}: status ${response.status}; ${JSON.stringify(data?.params || data?.message || data?.code || data?.error || '').slice(0,700)}`);
  return data;
}
function pass(name) { results.push({ name, passed: true }); console.log(`PASS ${name}`); }
async function account(key, invitation) {
  if (!state[key]) { state[key] = { email: `w4.audit.${key}.${Date.now()}@example.invalid`, password: `W4!${crypto.randomBytes(18).toString('hex')}` }; save(); }
  const credentials = state[key];
  if (invitation?.link) {
    const token = new URL(invitation.link).searchParams.get('token');
    assert.ok(token);
    await request('POST', '/v1/user-invitations/accept', { invitationToken: token });
  }
  if (!credentials.registered) {
    const auth = await request('POST', '/v1/authentication/sign-up', { ...credentials, firstName: 'W4 Audit', lastName: key, trackEvents: false, newsLetter: false });
    credentials.registered = true; save(); return auth;
  }
  return request('POST', '/v1/authentication/sign-in', { email: credentials.email, password: credentials.password });
}
async function main() {
  await request('GET', '/v1/health'); pass('API health');
  const owner = await account('owner');
  assert.ok(owner.platformId && owner.projectId && owner.token); state.ownerAuth = owner; save(); pass('Owner signup and login');
  const projectA = await request('POST', '/v1/projects', { displayName: 'W4 isolation A' }, owner);
  const platformB = await request('POST', '/v1/platforms', { name: 'W4 isolation B' }, owner);
  const projectB = await request('POST', '/v1/projects', { displayName: 'W4 isolation B' }, platformB);
  assert.notEqual(owner.platformId, platformB.platformId); pass('Two independent organizations');
  await request('GET', `/v1/users/${owner.id}`, undefined, owner);
  await request('GET', `/v1/users/${platformB.id}`, undefined, owner, [403,404]); pass('User profiles isolated by organization');
  state.fixture = { owner, platformB, projectA, projectB }; save();
  const projectsA = await request('GET', '/v1/projects', undefined, owner);
  assert.ok(projectsA.data.every(project => project.platformId === owner.platformId));
  assert.ok(!projectsA.data.some(project => project.id === projectB.id)); pass('Project listing isolated by organization');
  await request('GET', `/v1/projects/${projectB.id}`, undefined, owner, [403,404]);
  await request('POST', `/v1/projects/${projectB.id}`, { displayName: 'forbidden' }, owner, [403,404]);
  await request('DELETE', `/v1/projects/${projectB.id}`, undefined, owner, [403,404]); pass('Cross-organization project access denied');
  await request('GET', `/v1/flows?projectId=${projectB.id}`, undefined, owner, [403,404]);
  await request('GET', `/v1/app-connections?projectId=${projectB.id}`, undefined, owner, [403,404]);
  await request('GET', `/v1/w4/analytics?projectId=${projectB.id}`, undefined, owner, [403,404]); pass('Cross-organization flows, connections and analytics denied');
  for (const key of ['editor', 'viewer']) {
    if (!state[key]) { state[key] = { email: `w4.audit.${key}.${Date.now()}@example.invalid`, password: `W4!${crypto.randomBytes(18).toString('hex')}` }; save(); }
    const invitation = await request('POST', '/v1/user-invitations', { type: 'PLATFORM', email: state[key].email, platformRole: 'MEMBER', projectId: projectA.id, projectRole: key[0].toUpperCase() + key.slice(1) }, owner);
    const auth = await account(key, invitation); state.fixture[key] = auth; save();
    assert.equal(auth.platformId, owner.platformId);
  }
  pass('Invitation links work without SMTP and assign project roles');
  const { editor, viewer } = state.fixture;
  const flow = await request('POST', '/v1/flows', { projectId: projectA.id, displayName: 'W4 role test' }, editor);
  state.fixture.flow = flow; save(); pass('Editor creates a flow');
  await request('GET', `/v1/flows/${flow.id}?projectId=${projectA.id}`, undefined, viewer);
  await request('POST', '/v1/flows', { projectId: projectA.id, displayName: 'forbidden' }, viewer, [403]);
  await request('DELETE', `/v1/flows/${flow.id}?projectId=${projectA.id}`, undefined, viewer, [403]);
  await request('POST', '/v1/projects', { displayName: 'forbidden' }, viewer, [403]);
  await request('GET', '/v1/w4/analytics', undefined, viewer, [403]); pass('Viewer can read and cannot mutate flows or administer the organization');
  const memberships = await request('GET', `/v1/project-members?projectId=${projectA.id}`, undefined, owner);
  const editorMember = memberships.data.find(member => member.userId === editor.id);
  assert.ok(editorMember); assert.ok(memberships.data.every(member => !('identity' in member.user) && !('password' in member.user)));
  await request('POST', `/v1/project-members/${editorMember.id}`, { role: 'Viewer' }, owner);
  await request('POST', '/v1/flows', { projectId: projectA.id, displayName: 'forbidden' }, editor, [403]); pass('Role downgrade applies to existing sessions');
  await request('POST', `/v1/users/${viewer.id}`, { status: 'INACTIVE' }, owner);
  await request('GET', `/v1/flows?projectId=${projectA.id}`, undefined, viewer, [401,403]); pass('User suspension revokes existing session access');
  await request('POST', `/v1/users/${viewer.id}`, { status: 'ACTIVE' }, owner);
  await request('POST', `/v1/project-members/${editorMember.id}`, { role: 'Editor' }, owner);
  await request('POST', `/v1/users/${owner.id}`, { platformRole: 'MEMBER' }, owner, [400,403,409]); pass('Organization owner cannot be demoted');
  const analytics = await request('GET', `/v1/w4/analytics?projectId=${projectA.id}&days=7`, undefined, owner);
  assert.equal(analytics.organizationId, owner.platformId); assert.equal(analytics.projectId, projectA.id); assert.equal(analytics.flows, 1); pass('Analytics reflects actual scoped flow data');
  fs.writeFileSync('/tmp/w4-isolation-results.json', JSON.stringify({ passed: results.length, tests: results }, null, 2));
}
main().catch(error => { console.error(error.message); fs.writeFileSync('/tmp/w4-isolation-results.json', JSON.stringify({ passed: results.length, tests: results, error: error.message }, null, 2)); process.exitCode = 1; });
