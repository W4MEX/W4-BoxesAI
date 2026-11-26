import { ActivepiecesError, apId, ErrorCode, isNil, Permission, ProjectRole, RoleType } from '@activepieces/core-utils'
import { DefaultProjectRole, FlowOperationType, PlatformRole, Principal, PrincipalType, ProjectType, UserStatus } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { IsNull, MoreThan } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { websocketService } from '../core/websockets.service'
import { projectRepo } from '../project/project-repo'
import { UserEntity } from '../user/user-entity'
import { mapToUserWithMetaInformation } from '../user/user-service'
import { ProjectPermission, w4AccessPolicy } from './access-policy'
import { W4ProjectMemberEntity, W4ProjectRoleEntity } from './membership-entities'

function denied(): never {
    throw new ActivepiecesError({ code: ErrorCode.AUTHORIZATION, params: { message: 'W4: access denied for this organization or project' } })
}

async function roleForUser({ userId, projectId }: { userId: string, projectId: string }): Promise<ProjectRole> {
    const project = await projectRepo().findOneBy({ id: projectId })
    if (!project) return denied()
    const user = await repoFactory(UserEntity)().findOneBy({ id: userId, platformId: project.platformId, status: UserStatus.ACTIVE })
    if (!user) return denied()
    if (user.platformRole === PlatformRole.ADMIN || (project.type === ProjectType.PERSONAL && project.ownerId === user.id)) {
        return projectRoleService.getOneOrThrow({ name: DefaultProjectRole.ADMIN })
    }
    if (user.platformRole === PlatformRole.OPERATOR) {
        return projectRoleService.getOneOrThrow({ name: DefaultProjectRole.VIEWER })
    }
    const membership = await projectMemberRepo().findOne({ where: { userId, projectId, platformId: project.platformId }, relations: { projectRole: true } })
    if (!membership || (membership.projectRole.platformId && membership.projectRole.platformId !== project.platformId)) return denied()
    return membership.projectRole
}

async function assertProjectAccess({ principal, projectId, permission }: AccessRequest): Promise<void> {
    const project = await projectRepo().findOneBy({ id: projectId })
    if (!project || !('platform' in principal) || principal.platform.id !== project.platformId) return denied()
    if (principal.type === PrincipalType.ENGINE) {
        if (principal.projectId !== project.id) return denied()
        return
    }
    if (principal.type !== PrincipalType.USER) return denied()
    const user = await repoFactory(UserEntity)().findOneBy({ id: principal.id, platformId: project.platformId, status: UserStatus.ACTIVE })
    if (!user) return denied()
    const role = await roleForUser({ userId: user.id, projectId })
    if (!permission) return
    if (!role.permissions.includes(permission)) return denied()
    const mapped = permissionMap[permission]
    if (mapped) {
        const roleName = role.name === DefaultProjectRole.ADMIN ? 'admin' : role.name === DefaultProjectRole.EDITOR ? 'editor' : 'viewer'
        const allowed = w4AccessPolicy.projectAllows({
            membership: { organizationId: project.platformId, userId: user.id, status: 'active', role: user.platformRole === PlatformRole.ADMIN ? 'admin' : user.platformRole === PlatformRole.OPERATOR ? 'auditor' : 'member' },
            project: { id: project.id, organizationId: project.platformId, status: 'active' },
            grant: { projectId, organizationId: project.platformId, userId: user.id, role: roleName, status: 'active' },
            permission: mapped,
        })
        if (!allowed) return denied()
    }
}

export const projectRoleService = {
    async getOneOrThrow({ id, name, platformId }: { id?: string, name?: string, platformId?: string }): Promise<ProjectRole> {
        if (!id && !name) return denied()
        const role = await projectRoleRepo().findOne({ where: [
            { ...(id ? { id } : { name }), type: RoleType.DEFAULT, platformId: IsNull() },
            ...(platformId ? [{ ...(id ? { id } : { name }), platformId }] : []),
        ] })
        if (!role) return denied()
        return role
    },
    async getOneOrThrowById({ id }: { id: string }): Promise<ProjectRole> {
        const role = await projectRoleRepo().findOneBy({ id })
        if (!role) return denied()
        return role
    },
}

export const projectMemberService = (_log: FastifyBaseLogger) => ({
    getRole: roleForUser,
    async upsert({ projectId, userId, projectRoleName }: { projectId: string, userId: string, projectRoleName: string }) {
        const project = await projectRepo().findOneBy({ id: projectId })
        if (!project) return denied()
        const user = await repoFactory(UserEntity)().findOneBy({ id: userId, platformId: project.platformId, status: UserStatus.ACTIVE })
        if (!user) return denied()
        const role = await projectRoleService.getOneOrThrow({ name: projectRoleName, platformId: project.platformId })
        const existing = await projectMemberRepo().findOneBy({ userId, projectId, platformId: project.platformId })
        await projectMemberRepo().upsert({ id: existing?.id ?? apId(), userId, projectId, platformId: project.platformId, projectRoleId: role.id }, ['projectId', 'userId'])
        websocketService.disconnectUser({ userId })
    },
    async list({ platformId, projectId, limit = 100, projectRoleId, cursorRequest }: { platformId: string, projectId?: string, limit?: number, cursorRequest?: unknown, projectRoleId?: string }) {
        const data = await projectMemberRepo().find({ where: { platformId, ...(projectId ? { projectId } : {}), ...(typeof cursorRequest === 'string' && cursorRequest ? { id: MoreThan(cursorRequest) } : {}), ...(projectRoleId ? { projectRoleId } : {}) }, relations: { user: { identity: true }, projectRole: true, project: true }, take: Math.min(limit, 1000) + 1, order: { id: 'ASC' } })
        const page = data.slice(0, Math.min(limit, 1000))
        return { data: page.map(member => ({ ...member, user: mapToUserWithMetaInformation(member.user)! })), next: data.length > page.length ? page[page.length - 1].id : null, previous: null }
    },
    async getIdsOfProjects({ platformId, userId }: { platformId: string, userId: string }) {
        const members = await projectMemberRepo().find({ where: { platformId, userId }, select: { projectId: true } })
        return members.map(member => member.projectId)
    },
    async listProjectIdsWithPermission({ platformId, userId, permission }: { platformId: string, userId: string, permission: Permission }) {
        const user = await repoFactory(UserEntity)().findOneBy({ id: userId, platformId, status: UserStatus.ACTIVE })
        if (!user) return []
        if (user.platformRole === PlatformRole.ADMIN) return (await projectRepo().find({ where: { platformId }, select: { id: true } })).map(project => project.id)
        const memberships = await projectMemberRepo().find({ where: { platformId, userId }, relations: { projectRole: true, project: true } })
        return memberships.filter(member => isNil(member.project.deleted) && member.projectRole.permissions.includes(permission)).map(member => member.projectId)
    },
    async hasPermissionOnAnyProject(params: { platformId: string, userId: string, permission: Permission }) {
        return (await this.listProjectIdsWithPermission(params)).length > 0
    },
})

export const rbacService = (_log: FastifyBaseLogger) => ({ assertPrinicpalAccessToProject: assertProjectAccess })

export async function assertUserHasPermissionToFlow(principal: Principal, projectId: string, operation: FlowOperationType, _log: FastifyBaseLogger): Promise<void> {
    const permission = ['CHANGE_STATUS', 'LOCK_AND_PUBLISH', 'LOCK_FLOW', 'PUBLISH'].includes(operation) ? Permission.UPDATE_FLOW_STATUS : Permission.WRITE_FLOW
    await assertProjectAccess({ principal, projectId, permission })
}

export async function getPrincipalRoleOrThrow(userId: string, projectId: string, _log: FastifyBaseLogger): Promise<ProjectRole> {
    return roleForUser({ userId, projectId })
}

export async function assertRoleHasPermission(principal: Principal, projectId: string, permission: Permission, _log: FastifyBaseLogger): Promise<void> {
    await assertProjectAccess({ principal, projectId, permission })
}

export function editionRequiresRbac(): boolean {
    return true
}

export const projectMemberRepo = repoFactory(W4ProjectMemberEntity)
export const projectRoleRepo = repoFactory(W4ProjectRoleEntity)

const permissionMap: Partial<Record<Permission, ProjectPermission>> = {
    [Permission.READ_PROJECT]: 'project.read',
    [Permission.WRITE_PROJECT]: 'project.manage',
    [Permission.WRITE_PROJECT_MEMBER]: 'members.manage',
    [Permission.WRITE_INVITATION]: 'members.manage',
    [Permission.READ_FLOW]: 'flows.read',
    [Permission.WRITE_FLOW]: 'flows.write',
    [Permission.UPDATE_FLOW_STATUS]: 'flows.publish',
    [Permission.READ_RUN]: 'runs.read',
    [Permission.WRITE_RUN]: 'flows.run',
    [Permission.READ_APP_CONNECTION]: 'connections.read',
    [Permission.WRITE_APP_CONNECTION]: 'connections.manage',
    [Permission.REPLACE_APP_CONNECTION]: 'connections.manage',
}

type AccessRequest = { principal: Principal, projectId: string, permission: Permission | undefined }
