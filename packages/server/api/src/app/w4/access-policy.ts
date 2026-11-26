function organizationAllows({ membership, organizationId, permission }: OrganizationAccess): boolean {
    if (!membership || membership.organizationId !== organizationId || membership.status !== 'active') {
        return false
    }
    return organizationPermissions[membership.role].includes(permission)
}

function projectAllows({ membership, project, grant, permission }: ProjectAccess): boolean {
    if (!membership || membership.status !== 'active' || project.status !== 'active'
        || membership.organizationId !== project.organizationId) {
        return false
    }
    if (membership.role === 'owner' || membership.role === 'admin') {
        return projectPermissions.admin.includes(permission)
    }
    if (membership.role === 'auditor') {
        return auditorPermissions.includes(permission)
    }
    if (!grant || grant.organizationId !== project.organizationId || grant.projectId !== project.id
        || grant.userId !== membership.userId || grant.status !== 'active') {
        return false
    }
    return projectPermissions[grant.role].includes(permission)
}

function memberChangeAllowed({ actor, target, nextRole, nextStatus, activeOwnerCount }: MemberChange): boolean {
    if (!organizationAllows({ membership: actor, organizationId: target.organizationId, permission: 'members.manage' })) {
        return false
    }
    if (actor.role !== 'owner' && (target.role === 'owner' || nextRole === 'owner')) {
        return false
    }
    const removesActiveOwner = target.role === 'owner' && target.status === 'active'
        && (nextRole !== 'owner' || nextStatus !== 'active')
    return !removesActiveOwner || activeOwnerCount > 1
}

const organizationPermissions: Record<OrganizationRole, readonly OrganizationPermission[]> = {
    owner: ['organization.read', 'organization.manage', 'organization.delete', 'members.read', 'members.manage', 'projects.create', 'analytics.read', 'audit.read'],
    admin: ['organization.read', 'organization.manage', 'members.read', 'members.manage', 'projects.create', 'analytics.read', 'audit.read'],
    member: ['organization.read'],
    auditor: ['organization.read', 'members.read', 'analytics.read', 'audit.read'],
}

const auditorPermissions: readonly ProjectPermission[] = ['project.read', 'flows.read', 'runs.read', 'analytics.read']

const projectPermissions: Record<ProjectRole, readonly ProjectPermission[]> = {
    admin: ['project.read', 'project.manage', 'members.manage', 'flows.read', 'flows.write', 'flows.publish', 'flows.run', 'connections.read', 'connections.manage', 'runs.read', 'analytics.read'],
    editor: ['project.read', 'flows.read', 'flows.write', 'flows.publish', 'flows.run', 'connections.read', 'connections.manage', 'runs.read', 'analytics.read'],
    operator: ['project.read', 'flows.read', 'flows.run', 'runs.read', 'analytics.read'],
    viewer: ['project.read', 'flows.read', 'runs.read', 'analytics.read'],
}

export const w4AccessPolicy = { organizationAllows, projectAllows, memberChangeAllowed }

export type OrganizationRole = 'owner' | 'admin' | 'member' | 'auditor'
export type ProjectRole = 'admin' | 'editor' | 'operator' | 'viewer'
export type MembershipStatus = 'active' | 'suspended'
export type OrganizationPermission = 'organization.read' | 'organization.manage' | 'organization.delete' | 'members.read' | 'members.manage' | 'projects.create' | 'analytics.read' | 'audit.read'
export type ProjectPermission = 'project.read' | 'project.manage' | 'members.manage' | 'flows.read' | 'flows.write' | 'flows.publish' | 'flows.run' | 'connections.read' | 'connections.manage' | 'runs.read' | 'analytics.read'

export type OrganizationMembership = {
    organizationId: string
    userId: string
    role: OrganizationRole
    status: MembershipStatus
}

export type ProjectGrant = {
    organizationId: string
    projectId: string
    userId: string
    role: ProjectRole
    status: MembershipStatus
}

type OrganizationAccess = {
    membership: OrganizationMembership | null
    organizationId: string
    permission: OrganizationPermission
}

type ProjectAccess = {
    membership: OrganizationMembership | null
    project: { id: string, organizationId: string, status: MembershipStatus }
    grant: ProjectGrant | null
    permission: ProjectPermission
}

type MemberChange = {
    actor: OrganizationMembership
    target: OrganizationMembership
    nextRole: OrganizationRole
    nextStatus: MembershipStatus
    activeOwnerCount: number
}
