import { ActivepiecesError, ErrorCode } from '@activepieces/core-utils'
import { FlowStatus, OPEN_SOURCE_PLAN, PlatformPlan, PlatformUsage, ProjectType, UserStatus } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { EntityManager } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { flowRepo } from '../flows/flow/flow.repo'
import { projectRepo } from '../project/project-repo'
import { UserEntity } from '../user/user-entity'

function policyForPlatform({ platformId }: { platformId: string }): PlatformPlan {
    const now = new Date().toISOString()
    return {
        ...OPEN_SOURCE_PLAN,
        id: platformId,
        platformId,
        created: now,
        updated: now,
        plan: 'W4_COMMUNITY',
        projectRolesEnabled: true,
        analyticsEnabled: true,
        customAppearanceEnabled: true,
        billedTeamProjectsLimit: null,
        projectsLimit: quota('PROJECTS', 1000),
        usersLimit: quota('USERS', 1000),
        activeFlowsLimit: quota('FLOWS', 10000),
        licenseKey: null,
        licenseExpiresAt: null,
    }
}

function quota(name: string, fallback: number): number {
    const value = Number(process.env[`W4_MAX_${name}`] ?? fallback)
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid W4_MAX_${name}`)
    return value
}

function assertCapacity({ current, addition, maximum }: { current: number, addition: number, maximum: number }): void {
    if (current + addition > maximum) {
        throw new ActivepiecesError({ code: ErrorCode.VALIDATION, params: { message: 'W4: configured capacity exceeded' } })
    }
}

export const platformPlanService = (_log: FastifyBaseLogger) => ({
    async onPlatformCreated(platformId: string) {
        return policyForPlatform({ platformId }) 
    },
    async getOrCreateForPlatform(platformId: string) {
        return policyForPlatform({ platformId }) 
    },
    async checkUsersExceededLimit({ platformId, entityManager, additionalSeatsNeeded = 1 }: { platformId: string, entityManager?: EntityManager, additionalSeatsNeeded?: number }) {
        const current = await repoFactory(UserEntity)(entityManager).countBy({ platformId, status: UserStatus.ACTIVE })
        assertCapacity({ current, addition: additionalSeatsNeeded, maximum: quota('USERS', 1000) })
    },
    async checkActiveFlowsExceededLimit(platformId: string) {
        const current = await flowRepo().createQueryBuilder('flow').innerJoin('flow.project', 'project').where('project.platformId = :platformId', { platformId }).andWhere('project.deleted IS NULL').andWhere('flow.status = :status', { status: FlowStatus.ENABLED }).getCount()
        assertCapacity({ current, addition: 1, maximum: quota('FLOWS', 10000) })
    },
    async getUsage(platformId: string): Promise<PlatformUsage> {
        const [users, projects, activeFlows] = await Promise.all([
            repoFactory(UserEntity)().countBy({ platformId, status: UserStatus.ACTIVE }),
            projectRepo().countBy({ platformId, type: ProjectType.TEAM }),
            flowRepo().createQueryBuilder('flow').innerJoin('flow.project', 'project').where('project.platformId = :platformId', { platformId }).andWhere('flow.status = :status', { status: FlowStatus.ENABLED }).getCount(),
        ])
        return { users, activeUsers: users, teamProjects: projects, activeFlows, creditsUsed: 0, creditsRemaining: null, creditsNextResetAt: null, appSumoAiCreditsUsed: null, appSumoAiCreditsRemaining: null, invitedSeats: 0 }
    },
    async update(_params: unknown): Promise<never> {
        throw new ActivepiecesError({ code: ErrorCode.FEATURE_DISABLED, params: { message: 'W4 capacity is configured by the instance administrator' } })
    },
})

export const projectLimitsService = (_log: FastifyBaseLogger) => ({
    async checkActiveFlowsExceededLimit({ projectId }: { projectId: string }) {
        const current = await flowRepo().countBy({ projectId, status: FlowStatus.ENABLED })
        assertCapacity({ current, addition: 1, maximum: quota('PROJECT_FLOWS', 1000) })
    },
})

export const w4PlatformPolicy = { policyForPlatform }
