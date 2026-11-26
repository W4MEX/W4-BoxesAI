const { test } = require('node:test');
const assert = require('node:assert/strict');
const { w4AccessPolicy: policy } = require('../../packages/server/api/dist/src/app/w4/access-policy.js');

const member = { organizationId: 'customer-a', userId: 'alice', role: 'member', status: 'active' };
const project = { id: 'project-a', organizationId: 'customer-a', status: 'active' };
const grant = { ...member, projectId: project.id, role: 'editor' };

test('an organization owner cannot read another customer organization', () => {
  assert.equal(policy.organizationAllows({ membership: { ...member, role: 'owner' }, organizationId: 'customer-b', permission: 'organization.read' }), false);
});

for (const role of ['owner', 'admin', 'member', 'auditor']) {
  test(`${role} cannot cross an organization boundary even with a forged project grant`, () => {
    assert.equal(policy.projectAllows({ membership: { ...member, role }, project: { ...project, organizationId: 'customer-b' }, grant: { ...grant, organizationId: 'customer-b' }, permission: 'flows.read' }), false);
  });
  test(`suspended ${role} loses project access`, () => {
    assert.equal(policy.projectAllows({ membership: { ...member, role, status: 'suspended' }, project, grant, permission: 'project.read' }), false);
  });
}

test('a member needs an explicit project grant', () => {
  assert.equal(policy.projectAllows({ membership: member, project, grant: null, permission: 'flows.read' }), false);
});

test('a grant for another user cannot be reused', () => {
  assert.equal(policy.projectAllows({ membership: member, project, grant: { ...grant, userId: 'bob' }, permission: 'flows.read' }), false);
});

test('a grant for another project cannot be reused', () => {
  assert.equal(policy.projectAllows({ membership: member, project, grant: { ...grant, projectId: 'project-b' }, permission: 'flows.read' }), false);
});

test('a suspended project rejects even its organization owner', () => {
  assert.equal(policy.projectAllows({ membership: { ...member, role: 'owner' }, project: { ...project, status: 'suspended' }, grant, permission: 'project.read' }), false);
});

test('editor can edit and run flows but cannot manage membership', () => {
  for (const permission of ['flows.write', 'flows.run']) {
    assert.equal(policy.projectAllows({ membership: member, project, grant, permission }), true);
  }
  assert.equal(policy.projectAllows({ membership: member, project, grant, permission: 'members.manage' }), false);
});

test('operator can run flows but cannot edit, publish or manage connections', () => {
  const operator = { ...grant, role: 'operator' };
  assert.equal(policy.projectAllows({ membership: member, project, grant: operator, permission: 'flows.run' }), true);
  for (const permission of ['flows.write', 'flows.publish', 'connections.manage']) {
    assert.equal(policy.projectAllows({ membership: member, project, grant: operator, permission }), false);
  }
});

test('viewer cannot execute flows or access connection metadata', () => {
  const viewer = { ...grant, role: 'viewer' };
  assert.equal(policy.projectAllows({ membership: member, project, grant: viewer, permission: 'flows.read' }), true);
  for (const permission of ['flows.run', 'flows.write', 'connections.read']) {
    assert.equal(policy.projectAllows({ membership: member, project, grant: viewer, permission }), false);
  }
});

test('auditor has read access but no write access despite an editor grant', () => {
  const auditor = { ...member, role: 'auditor' };
  assert.equal(policy.projectAllows({ membership: auditor, project, grant, permission: 'analytics.read' }), true);
  assert.equal(policy.projectAllows({ membership: auditor, project, grant, permission: 'flows.write' }), false);
});

test('an administrator cannot promote themselves to owner', () => {
  const administrator = { ...member, role: 'admin' };
  assert.equal(policy.memberChangeAllowed({ actor: administrator, target: administrator, nextRole: 'owner', nextStatus: 'active', activeOwnerCount: 1 }), false);
});

test('the last active owner cannot be suspended or demoted', () => {
  const owner = { ...member, role: 'owner' };
  assert.equal(policy.memberChangeAllowed({ actor: owner, target: owner, nextRole: 'member', nextStatus: 'active', activeOwnerCount: 1 }), false);
  assert.equal(policy.memberChangeAllowed({ actor: owner, target: owner, nextRole: 'owner', nextStatus: 'suspended', activeOwnerCount: 1 }), false);
});

test('ownership may change when another active owner remains', () => {
  const owner = { ...member, role: 'owner' };
  assert.equal(policy.memberChangeAllowed({ actor: owner, target: owner, nextRole: 'admin', nextStatus: 'active', activeOwnerCount: 2 }), true);
});

test('membership changes cannot target another organization', () => {
  assert.equal(policy.memberChangeAllowed({ actor: { ...member, role: 'owner' }, target: { ...member, organizationId: 'customer-b' }, nextRole: 'admin', nextStatus: 'active', activeOwnerCount: 2 }), false);
});

test('unknown permissions and missing membership are denied', () => {
  assert.equal(policy.organizationAllows({ membership: null, organizationId: 'customer-a', permission: 'organization.read' }), false);
  assert.equal(policy.projectAllows({ membership: member, project, grant, permission: 'connections.exportSecrets' }), false);
});
