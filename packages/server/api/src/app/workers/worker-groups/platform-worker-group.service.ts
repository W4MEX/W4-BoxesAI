import { ActivepiecesError, ErrorCode } from '@activepieces/core-utils'
import { FastifyBaseLogger } from 'fastify'

function unavailable(): never {
    throw new ActivepiecesError({ code: ErrorCode.FEATURE_DISABLED, params: { message: 'Dedicated worker groups are not configured in W4' } })
}

export const platformWorkerGroupService = (_log: FastifyBaseLogger) => ({
    async isWorkerGroupsEnabled(_params: { platformId: string }): Promise<boolean> {
        return false
    },
    async getWorkerGroupId(_params: { platformId: string }): Promise<string | null> {
        return null
    },
    async getWorkerGroupPlatformId(_params: { workerGroupId: string }): Promise<string | null> {
        return null
    },
    async isCanaryPlatform(_params: { platformId: string }): Promise<boolean> {
        return false
    },
    async updateWorkerGroup(_params: { platformId: string, workerGroupId: string | null }): Promise<void> {
        return unavailable()
    },
    async updateCanary(_params: { platformId: string, canary: boolean }): Promise<void> {
        return unavailable()
    },
    async moveJobsToTargetQueue(_params: { platformId: string, workerGroupId: string | null }): Promise<void> {
        return unavailable()
    },
})

export const CANARY_WORKER_GROUP_ID = 'canary'
