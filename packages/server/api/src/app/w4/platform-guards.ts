import { ActivepiecesError, ErrorCode } from '@activepieces/core-utils'
import { PlatformResponse, PlatformRole, PrincipalType, ProjectType, UserStatus } from '@activepieces/shared'
import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { repoFactory } from '../core/db/repo-factory'
import { platformService } from '../platform/platform.service'
import { projectRepo } from '../project/project-repo'
import { UserEntity } from '../user/user-entity'

async function platformMustBeOwnedByCurrentUser(request: FastifyRequest, _reply?: FastifyReply): Promise<void> {
    if (request.principal.type !== PrincipalType.USER) return deny()
    const user = await repoFactory(UserEntity)().findOneBy({ id: request.principal.id, platformId: request.principal.platform.id, status: UserStatus.ACTIVE, platformRole: PlatformRole.ADMIN })
    if (!user) return deny()
}

async function platformToEditMustBeOwnedByCurrentUser(request: FastifyRequest, _reply?: FastifyReply): Promise<void> {
    await platformMustBeOwnedByCurrentUser(request)
    const params = z.object({ id: z.string() }).parse(request.params)
    if (!('platform' in request.principal) || params.id !== request.principal.platform.id) return deny()
}

async function projectMustBeTeamType(request: FastifyRequest, _reply?: FastifyReply): Promise<void> {
    if (!('platform' in request.principal)) return deny()
    const query = z.object({ projectId: z.string().optional() }).passthrough().safeParse(request.query)
    const body = z.object({ projectId: z.string().optional() }).passthrough().safeParse(request.body)
    const projectId = request.projectId ?? (query.success ? query.data.projectId : undefined) ?? (body.success ? body.data.projectId : undefined)
    if (!projectId) return deny()
    const project = await projectRepo().findOneBy({ id: projectId, platformId: request.principal.platform.id, type: ProjectType.TEAM })
    if (!project) return deny()
}

function platformMustHaveFeatureEnabled(predicate: (platform: PlatformResponse) => boolean) {
    return async (request: FastifyRequest, _reply?: FastifyReply): Promise<void> => {
        if (!('platform' in request.principal)) return deny()
        const platform = await platformService(request.log).getOneWithPlanAndUsageOrThrow(request.principal.platform.id)
        if (!predicate(platform)) throw new ActivepiecesError({ code: ErrorCode.FEATURE_DISABLED, params: { message: 'This capability is not available in W4' } })
    }
}

function deny(): never {
    throw new ActivepiecesError({ code: ErrorCode.AUTHORIZATION, params: { message: 'W4: organization administrator access required' } })
}

export { platformMustBeOwnedByCurrentUser, platformToEditMustBeOwnedByCurrentUser, platformMustHaveFeatureEnabled, projectMustBeTeamType }
