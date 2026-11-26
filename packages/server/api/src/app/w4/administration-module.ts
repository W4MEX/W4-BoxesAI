import { ActivepiecesError, ErrorCode, Permission } from '@activepieces/core-utils'
import { DefaultProjectRole, PlatformRole, PrincipalType, ProjectType, UserStatus } from '@activepieces/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { websocketService } from '../core/websockets.service'
import { projectRepo } from '../project/project-repo'
import { projectService } from '../project/project-service'
import { userRepo, userService } from '../user/user-service'
import { getPrincipalRoleOrThrow, projectMemberRepo, projectMemberService, projectRoleRepo, projectRoleService, rbacService } from './membership-service'

import { projectViews } from './project-view'

const projectsController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', { config: { security: securityAccess.publicPlatform([PrincipalType.USER]) } }, async request => {
        const user = await userRepo().findOneByOrFail({ id: request.principal.id, platformId: request.principal.platform.id, status: UserStatus.ACTIVE })
        const projects = await projectService(request.log).getAllForUser({ userId: user.id, platformId: request.principal.platform.id, isPrivileged: user.platformRole === PlatformRole.ADMIN || user.platformRole === PlatformRole.OPERATOR })
        return { data: await projectViews({ projects, platformId: request.principal.platform.id }), next: null, previous: null }
    })
    app.post('/', {
        config: { security: securityAccess.platformAdminOnly([PrincipalType.USER]) },
        schema: { body: z.object({ displayName: z.string().trim().min(1).max(100), externalId: z.string().nullish(), sensitive: z.boolean().optional() }) },
    }, async request => {
        const project = await projectService(request.log).create({ ownerId: request.principal.id, platformId: request.principal.platform.id, displayName: request.body.displayName, externalId: request.body.externalId ?? undefined, sensitive: request.body.sensitive, type: ProjectType.TEAM })
        await projectMemberService(request.log).upsert({ projectId: project.id, userId: request.principal.id, projectRoleName: DefaultProjectRole.ADMIN })
        return withLimits(project)
    })
    app.get('/:id', { config: { security: securityAccess.publicPlatform([PrincipalType.USER]) }, schema: { params: idParams } }, async request => {
        await rbacService(request.log).assertPrinicpalAccessToProject({ principal: request.principal, projectId: request.params.id, permission: Permission.READ_PROJECT })
        return withLimits(await projectService(request.log).getOneOrThrow(request.params.id))
    })
    app.post('/:id', {
        config: { security: securityAccess.publicPlatform([PrincipalType.USER]) },
        schema: { params: idParams, body: z.object({ displayName: z.string().trim().min(1).max(100).optional(), isDefault: z.boolean().optional(), sensitive: z.boolean().optional(), externalId: z.string().optional() }) },
    }, async request => {
        await rbacService(request.log).assertPrinicpalAccessToProject({ principal: request.principal, projectId: request.params.id, permission: Permission.WRITE_PROJECT })
        const project = await projectService(request.log).getOneOrThrow(request.params.id)
        if (project.type !== ProjectType.TEAM) throw new ActivepiecesError({ code: ErrorCode.VALIDATION, params: { message: 'Personal project settings cannot be changed here' } })
        return withLimits(await projectService(request.log).update(project.id, { type: ProjectType.TEAM, ...request.body }))
    })
    app.delete('/:id', { config: { security: securityAccess.platformAdminOnly([PrincipalType.USER]) }, schema: { params: idParams } }, async (request, reply) => {
        const project = await projectRepo().findOneBy({ id: request.params.id, platformId: request.principal.platform.id, type: ProjectType.TEAM })
        if (!project) throw new ActivepiecesError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'project', entityId: request.params.id } })
        await projectRepo().softDelete({ id: project.id, platformId: request.principal.platform.id })
        return reply.code(204).send()
    })
}

const membersController: FastifyPluginAsyncZod = async (app) => {
    app.get('/role', { config: { security: securityAccess.publicPlatform([PrincipalType.USER]) }, schema: { querystring: z.object({ projectId: z.string().length(21) }) } }, async request => {
        await rbacService(request.log).assertPrinicpalAccessToProject({ principal: request.principal, projectId: request.query.projectId, permission: Permission.READ_PROJECT })
        return getPrincipalRoleOrThrow(request.principal.id, request.query.projectId, request.log)
    })
    app.get('/', { config: { security: securityAccess.publicPlatform([PrincipalType.USER]) }, schema: { querystring: z.object({ projectId: z.string().length(21), projectRoleId: z.string().optional(), limit: z.coerce.number().int().min(1).max(1000).default(100), cursor: z.string().optional() }) } }, async request => {
        await rbacService(request.log).assertPrinicpalAccessToProject({ principal: request.principal, projectId: request.query.projectId, permission: Permission.READ_PROJECT_MEMBER })
        const members = await projectMemberService(request.log).list({ platformId: request.principal.platform.id, ...request.query, cursorRequest: request.query.cursor })
        return members
    })
    app.post('/:id', { config: { security: securityAccess.publicPlatform([PrincipalType.USER]) }, schema: { params: idParams, body: z.object({ role: z.enum(DefaultProjectRole) }) } }, async request => {
        const member = await projectMemberRepo().findOneBy({ id: request.params.id, platformId: request.principal.platform.id })
        if (!member) throw new ActivepiecesError({ code: ErrorCode.AUTHORIZATION, params: { message: 'Membership is not accessible' } })
        await rbacService(request.log).assertPrinicpalAccessToProject({ principal: request.principal, projectId: member.projectId, permission: Permission.WRITE_PROJECT_MEMBER })
        await projectMemberService(request.log).upsert({ projectId: member.projectId, userId: member.userId, projectRoleName: request.body.role })
        return { success: true }
    })
    app.post('/', { config: { security: securityAccess.publicPlatform([PrincipalType.USER]) }, schema: { body: z.object({ projectId: z.string().length(21), userId: z.string().length(21), projectRoleName: z.enum(DefaultProjectRole) }) } }, async request => {
        await rbacService(request.log).assertPrinicpalAccessToProject({ principal: request.principal, projectId: request.body.projectId, permission: Permission.WRITE_PROJECT_MEMBER })
        await projectMemberService(request.log).upsert(request.body)
        return { success: true }
    })
    app.delete('/:id', { config: { security: securityAccess.publicPlatform([PrincipalType.USER]) }, schema: { params: idParams } }, async (request, reply) => {
        const member = await projectMemberRepo().findOneBy({ id: request.params.id, platformId: request.principal.platform.id })
        if (!member) throw new ActivepiecesError({ code: ErrorCode.AUTHORIZATION, params: { message: 'Membership is not accessible' } })
        await rbacService(request.log).assertPrinicpalAccessToProject({ principal: request.principal, projectId: member.projectId, permission: Permission.WRITE_PROJECT_MEMBER })
        await projectMemberRepo().delete({ id: member.id, platformId: request.principal.platform.id })
        websocketService.disconnectUser({ userId: member.userId })
        return reply.code(204).send()
    })
}

async function withLimits(project: Awaited<ReturnType<ReturnType<typeof projectService>['getOneOrThrow']>>) {
    return (await projectViews({ projects: [project], platformId: project.platformId }))[0]
}

export const w4AdministrationModule: FastifyPluginAsyncZod = async app => {
    app.get('/v1/users/:id', { config: { security: securityAccess.publicPlatform([PrincipalType.USER]) }, schema: { params: idParams } }, request => userService(request.log).getOneByIdAndPlatformIdOrThrow({ id: request.params.id, platformId: request.principal.platform.id }))
    await app.register(projectsController, { prefix: '/v1/projects' })
    await app.register(membersController, { prefix: '/v1/project-members' })
    app.get('/v1/project-roles', { config: { security: securityAccess.publicPlatform([PrincipalType.USER]) } }, async () => ({ data: await projectRoleRepo().findBy({ type: 'DEFAULT' }), next: null, previous: null }))
    app.get('/v1/project-roles/:id', { config: { security: securityAccess.publicPlatform([PrincipalType.USER]) }, schema: { params: idParams } }, request => projectRoleService.getOneOrThrow({ id: request.params.id, platformId: request.principal.platform.id }))
    app.get('/v1/project-roles/:id/project-members', { config: { security: securityAccess.platformAdminOnly([PrincipalType.USER]) }, schema: { params: idParams, querystring: z.object({ limit: z.coerce.number().int().min(1).max(1000).default(100), cursor: z.string().optional() }) } }, async request => {
        await projectRoleService.getOneOrThrow({ id: request.params.id, platformId: request.principal.platform.id })
        return projectMemberService(request.log).list({ platformId: request.principal.platform.id, projectRoleId: request.params.id, limit: request.query.limit, cursorRequest: request.query.cursor })
    })
}

const idParams = z.object({ id: z.string().length(21) })
