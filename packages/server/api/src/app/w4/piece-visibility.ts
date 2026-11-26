import { ActivepiecesError, ErrorCode } from '@activepieces/core-utils'
import { FastifyBaseLogger } from 'fastify'
import { projectRepo } from '../project/project-repo'

export async function resolveVisibility({ platformId, projectId }: { platformId?: string | null, projectId?: string | null, log: FastifyBaseLogger }) {
    if (projectId) {
        if (!platformId || !await projectRepo().existsBy({ id: projectId, platformId })) {
            throw new ActivepiecesError({ code: ErrorCode.AUTHORIZATION, params: { message: 'Project is not part of this organization' } })
        }
    }
    const allowed = new Set((process.env.W4_ALLOWED_PIECES ?? '').split(',').map(name => name.trim()).filter(Boolean))
    const isPieceVisible = (name: string) => allowed.size === 0 || allowed.has(name)
    return {
        isPieceVisible,
        filterPieces: <T extends { name: string }>(pieces: T[]): T[] => pieces.filter(piece => isPieceVisible(piece.name)),
        filterComponents: <T>(components: T[]): T[] => components,
        filterPieceComponents: <T>(piece: T): T => piece,
    }
}
