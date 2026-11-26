import { ActivepiecesError, ErrorCode, isNil } from '@activepieces/core-utils'
import { UserStatus } from '@activepieces/shared'
import { z } from 'zod'
import { repoFactory } from '../core/db/repo-factory'
import { flowRepo } from '../flows/flow/flow.repo'
import { FlowRunEntity } from '../flows/flow-run/flow-run-entity'
import { projectRepo } from '../project/project-repo'
import { userRepo } from '../user/user-service'

async function report({ platformId, projectId, days, now = new Date() }: ReportParams): Promise<AnalyticsReport> {
    if (projectId) {
        const project = await projectRepo().findOneBy({ id: projectId, platformId })
        if (isNil(project)) {
            throw new ActivepiecesError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'project', entityId: projectId } })
        }
    }
    const from = new Date(now.getTime() - days * 86_400_000)
    const runs = repoFactory(FlowRunEntity)().createQueryBuilder('run')
        .innerJoin('run.project', 'project')
        .where('project.platformId = :platformId', { platformId })
        .andWhere('project.deleted IS NULL')
        .andWhere('run.created >= :from AND run.created < :until', { from, until: now })
        .andWhere('run.environment = :environment', { environment: 'PRODUCTION' })
        .andWhere('run.parentRunId IS NULL')
        .andWhere('run.parentWaitpointId IS NULL')
    const flows = flowRepo().createQueryBuilder('flow')
        .innerJoin('flow.project', 'project')
        .where('project.platformId = :platformId', { platformId })
        .andWhere('project.deleted IS NULL')
    if (projectId) {
        runs.andWhere('run.projectId = :projectId', { projectId })
        flows.andWhere('flow.projectId = :projectId', { projectId })
    }
    const [statusRows, durationRow, dailyRows, flowCount, enabledFlows, projects, activeUsers] = await Promise.all([
        runs.clone().select('run.status', 'status').addSelect('COUNT(*)::int', 'count').groupBy('run.status').getRawMany<unknown>(),
        runs.clone().select('AVG(EXTRACT(EPOCH FROM (run."finishTime" - run."startTime")) * 1000)', 'averageDurationMs')
            .andWhere('run.finishTime IS NOT NULL AND run.startTime IS NOT NULL')
            .andWhere('run.finishTime >= run.startTime').getRawOne<unknown>(),
        runs.clone().select('TO_CHAR(run.created AT TIME ZONE \'UTC\', \'YYYY-MM-DD\')', 'date')
            .addSelect('COUNT(*)::int', 'count').groupBy('date').orderBy('date', 'ASC').getRawMany<unknown>(),
        flows.clone().getCount(),
        flows.clone().andWhere('flow.status = :status', { status: 'ENABLED' }).getCount(),
        projectRepo().countBy({ platformId, ...(projectId ? { id: projectId } : {}) }),
        userRepo().countBy({ platformId, status: UserStatus.ACTIVE }),
    ])
    const statuses = z.array(statusCount).parse(statusRows)
    const total = statuses.reduce((sum, row) => sum + row.count, 0)
    const succeeded = statuses.find(row => row.status === 'SUCCEEDED')?.count ?? 0
    const failed = statuses.filter(row => failureStatuses.includes(row.status)).reduce((sum, row) => sum + row.count, 0)
    const terminal = succeeded + failed
    return {
        organizationId: platformId,
        projectId: projectId ?? null,
        from: from.toISOString(),
        until: now.toISOString(),
        timezone: 'UTC',
        projects,
        activeUsers,
        flows: flowCount,
        enabledFlows,
        runs: { total, succeeded, failed, successRate: terminal === 0 ? null : succeeded / terminal, statuses },
        averageDurationMs: z.object({ averageDurationMs: z.coerce.number().nonnegative().nullable() }).parse(durationRow).averageDurationMs,
        dailyRuns: z.array(z.object({ date: z.string(), count: z.coerce.number().int().nonnegative() })).parse(dailyRows),
    }
}

const failureStatuses = ['FAILED', 'QUOTA_EXCEEDED', 'INTERNAL_ERROR', 'MEMORY_LIMIT_EXCEEDED', 'TIMEOUT', 'LOG_SIZE_EXCEEDED']
const statusCount = z.object({ status: z.string(), count: z.coerce.number().int().nonnegative() })

export const w4AnalyticsService = { report }

type ReportParams = { platformId: string, projectId?: string, days: number, now?: Date }
type AnalyticsReport = {
    organizationId: string
    projectId: string | null
    from: string
    until: string
    timezone: string
    projects: number
    activeUsers: number
    flows: number
    enabledFlows: number
    runs: { total: number, succeeded: number, failed: number, successRate: number | null, statuses: { status: string, count: number }[] }
    averageDurationMs: number | null
    dailyRuns: { date: string, count: number }[]
}
