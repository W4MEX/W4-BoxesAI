import { ProjectType } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { projectRepo } from '../project/project-repo'

export const platformProjectService = (_log: FastifyBaseLogger) => ({
    async deletePersonalProjectForUser({ userId, platformId }: { userId: string, platformId: string }) {
        await projectRepo().softDelete({ ownerId: userId, platformId, type: ProjectType.PERSONAL })
    },
})
