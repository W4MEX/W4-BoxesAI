import { ActivepiecesError, ErrorCode } from '@activepieces/core-utils'
import { FastifyBaseLogger } from 'fastify'
import { projectRepo } from '../project/project-repo'

function unavailable(): never {
    throw new ActivepiecesError({ code: ErrorCode.FEATURE_DISABLED, params: { message: 'This optional service is not installed in W4' } })
}

export const openRouterApi = {
    async createKey(_params: unknown): Promise<{ key: string, data: { hash: string } }> {
        return unavailable() 
    },
    async isKeyLive(_params: unknown): Promise<boolean> {
        return unavailable() 
    },
    async deleteKey(_params: unknown): Promise<void> {
        return unavailable() 
    },
}

export const concurrencyPoolService = (_log: FastifyBaseLogger) => ({
    async getProjectPoolId(projectId: string): Promise<string | null> {
        const project = await projectRepo().findOneByOrFail({ id: projectId })
        if (project.poolId) return unavailable()
        return null
    },
    async getPoolLimit(_poolId: string): Promise<number> {
        return unavailable() 
    },
})
