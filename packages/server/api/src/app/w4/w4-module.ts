import { ActivepiecesError, ErrorCode } from '@activepieces/core-utils'
import { PlatformRole, PrincipalType, UserStatus } from '@activepieces/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { userRepo } from '../user/user-service'
import { w4AnalyticsService } from './analytics-service'

const analyticsController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', {
        config: { security: securityAccess.platformAdminOnly([PrincipalType.USER]) },
        schema: {
            querystring: z.strictObject({
                days: z.coerce.number().int().min(1).max(90).default(30),
                projectId: z.string().length(21).optional(),
            }),
        },
    }, async (request) => {
        const member = await userRepo().findOneBy({
            id: request.principal.id,
            platformId: request.principal.platform.id,
            status: UserStatus.ACTIVE,
            platformRole: PlatformRole.ADMIN,
        })
        if (!member) {
            throw new ActivepiecesError({ code: ErrorCode.AUTHORIZATION, params: { message: 'Organization access denied' } })
        }
        return w4AnalyticsService.report({
            platformId: request.principal.platform.id,
            projectId: request.query.projectId,
            days: request.query.days,
        })
    })
}

export const w4Module: FastifyPluginAsyncZod = async (app) => {
    await app.register(analyticsController, { prefix: '/v1/w4/analytics' })
}
