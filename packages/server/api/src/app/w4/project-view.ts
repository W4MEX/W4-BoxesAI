import { FlowStatus, PiecesFilterType, Project, ProjectWithLimits, UserStatus } from '@activepieces/shared'
import { z } from 'zod'
import { databaseConnection } from '../database/database-connection'

export async function projectViews({ projects, platformId }: { projects: Project[], platformId: string }): Promise<ProjectWithLimits[]> {
    if (projects.length === 0) return []
    const rows: unknown = await databaseConnection().query(`
        SELECT p.id,
          (SELECT COUNT(*)::int FROM "user" u WHERE u."platformId" = p."platformId"
            AND (u.id = p."ownerId" OR u."platformRole" IN ('ADMIN','OPERATOR') OR EXISTS
              (SELECT 1 FROM project_member m WHERE m."projectId" = p.id AND m."platformId" = p."platformId" AND m."userId" = u.id))) AS "totalUsers",
          (SELECT COUNT(*)::int FROM "user" u WHERE u."platformId" = p."platformId" AND u.status = $3
            AND (u.id = p."ownerId" OR u."platformRole" IN ('ADMIN','OPERATOR') OR EXISTS
              (SELECT 1 FROM project_member m WHERE m."projectId" = p.id AND m."platformId" = p."platformId" AND m."userId" = u.id))) AS "activeUsers",
          (SELECT COUNT(*)::int FROM flow f WHERE f."projectId" = p.id) AS "totalFlows",
          (SELECT COUNT(*)::int FROM flow f WHERE f."projectId" = p.id AND f.status = $4) AS "activeFlows",
          (SELECT MAX(f.updated) FROM flow f WHERE f."projectId" = p.id) AS "lastFlowUpdated"
        FROM project p WHERE p."platformId" = $1 AND p.id = ANY($2) AND p.deleted IS NULL
    `, [platformId, projects.map(project => project.id), UserStatus.ACTIVE, FlowStatus.ENABLED])
    const metrics = z.array(z.object({
        id: z.string(),
        totalUsers: z.number(),
        activeUsers: z.number(),
        totalFlows: z.number(),
        activeFlows: z.number(),
        lastFlowUpdated: z.union([z.date(), z.string()]).nullable(),
    })).parse(rows)
    return projects.map(project => {
        const analytics = metrics.find(row => row.id === project.id)
        if (!analytics) throw new Error('Project no longer available in this organization')
        return ProjectWithLimits.parse({
            ...project,
            plan: {
                id: project.id,
                projectId: project.id,
                created: project.created,
                updated: project.updated,
                name: 'W4',
                locked: false,
                activeFlowsLimit: Number(process.env.W4_MAX_PROJECT_FLOWS ?? 1000),
                pieces: [],
                piecesFilterType: PiecesFilterType.NONE,
            },
            analytics,
        })
    })
}
