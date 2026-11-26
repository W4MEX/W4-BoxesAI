import { groupBy, tryCatch } from '@activepieces/core-utils'
import { PieceMetadataModel } from '@activepieces/pieces-framework'
import { apVersionUtil } from '@activepieces/server-utils'
import { PackageType, PieceAudienceFilter, PieceSyncMode, PieceType } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import semver from 'semver'
import { z } from 'zod'
import { rejectedPromiseHandler } from '../helper/promise-handler'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { isToolSearchEnabled } from '../tool-search/tool-search-flag'
import { toolSearchReindexJob } from '../tool-search/tool-search-reindex.job'
import { pieceCache } from './metadata/piece-cache'
import { PieceMetadataSchema } from './metadata/piece-metadata-entity'
import { pieceMetadataService, pieceRepos } from './metadata/piece-metadata-service'

const CLOUD_API_URL = 'https://cloud.activepieces.com/api/v1/pieces'
const syncMode = system.get<PieceSyncMode>(AppSystemProp.PIECES_SYNC_MODE)
const CACHE_INVALIDATION_INTERVAL_MS = 15_000

export const pieceSyncService = (log: FastifyBaseLogger) => ({
    async setup(): Promise<void> {
        systemJobHandlers.registerJobHandler(SystemJobName.PIECES_SYNC, async function syncPiecesJobHandler(): Promise<void> {
            await pieceSyncService(log).sync({ publishCacheRefresh: true })
        })
        rejectedPromiseHandler(pieceSyncService(log).sync({ publishCacheRefresh: false }), log)
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.PIECES_SYNC,
                data: {},
                jobId: SystemJobName.PIECES_SYNC,
            },
            schedule: {
                type: 'repeated',
                cron: `${Math.floor(Math.random() * 5)} */1 * * *`,
            },
        })
    },
    async sync({ publishCacheRefresh }: { publishCacheRefresh: boolean }): Promise<void> {
        if (syncMode !== PieceSyncMode.OFFICIAL_AUTO) {
            log.info('Piece sync service is disabled')
            return
        }
        try {
            log.info('Starting piece synchronization')
            const startTime = performance.now()
            const [dbPieces, cloudPieces] = await Promise.all([pieceRepos().find({
                select: {
                    name: true,
                    version: true,
                    pieceType: true,
                },
            }), listCloudPieces()])
            log.info({ dbCount: dbPieces.length, cloudCount: cloudPieces.length }, 'Fetched pieces from DB and Cloud')
            const { added, fetchFailed } = await installNewPieces(cloudPieces, dbPieces, log, publishCacheRefresh)
            const deleted = await deletePiecesIfNotOnCloud(dbPieces, cloudPieces, log)

            log.info({
                added,
                fetchFailed,
                deleted,
                durationMs: Math.floor(performance.now() - startTime),
            }, 'Piece synchronization completed')

            // React to the catalog-change signal: enqueue an async tool-search reconcile (never inline
            // — embedding must not block sync). The hash-gate means an unchanged catalog re-embeds
            // nothing, so this is cheap; only fire when something changed AND the engine is enabled —
            // without the flag guard a delta would enqueue a reconcile even when tool-search is off,
            // which (if an OpenAI key exists but pgvector does not) crashes silently on every change.
            if ((added > 0 || deleted > 0) && isToolSearchEnabled()) {
                rejectedPromiseHandler(toolSearchReindexJob(log).enqueue({ type: 'all' }), log)
            }
        }
        catch (error) {
            log.error({ error }, 'Error syncing pieces')
        }
    },
})

async function deletePiecesIfNotOnCloud(dbPieces: PieceMetadataOnly[], cloudPieces: PieceRegistryResponse[], log: FastifyBaseLogger): Promise<number> {
    const cloudMap = new Map<string, true>(cloudPieces.map(cloudPiece => [`${cloudPiece.name}:${cloudPiece.version}`, true]))
    const piecesToDelete = dbPieces.filter(piece => piece.pieceType === PieceType.OFFICIAL && !cloudMap.has(`${piece.name}:${piece.version}`))
    await pieceMetadataService(log).bulkDelete(piecesToDelete.map(piece => ({ name: piece.name, version: piece.version })))
    return piecesToDelete.length
}

async function installNewPieces(cloudPieces: PieceRegistryResponse[], dbPieces: PieceMetadataOnly[], log: FastifyBaseLogger, _publishCacheRefresh: boolean): Promise<{ added: number, fetchFailed: number }> {
    const dbMap = new Map<string, true>(dbPieces.map(dbPiece => [`${dbPiece.name}:${dbPiece.version}`, true]))
    const newPiecesToFetch = cloudPieces.filter(piece => !dbMap.has(`${piece.name}:${piece.version}`))
    const batchSize = 5
    let added = 0
    let fetchFailed = 0
    let addedAtLastInvalidation = 0
    let lastInvalidationTime = performance.now()
    for (let done = 0; done < newPiecesToFetch.length; done += batchSize) {
        const currentBatch = newPiecesToFetch.slice(done, done + batchSize)
        await Promise.all(currentBatch.map(async (piece) => {
            const { error: fetchError } = await tryCatch(async () => {
                const queryParams = new URLSearchParams({ audience: PieceAudienceFilter.ALL })
                if (piece.version) {
                    queryParams.append('version', piece.version)
                }
                const url = `${CLOUD_API_URL}/${piece.name}?${queryParams.toString()}`
                const pieceMetadata: PieceMetadataModel = JSON.parse(await readCloudText({ url }))
                z.object({
                    name: z.string(),
                    version: z.string(),
                    pieceType: z.enum(PieceType),
                    packageType: z.enum(PackageType),
                    actions: z.record(z.string(), z.unknown()),
                    triggers: z.record(z.string(), z.unknown()),
                }).parse(pieceMetadata)
                const { error } = await tryCatch(() => pieceMetadataService(log).create({
                    pieceMetadata,
                    packageType: pieceMetadata.packageType,
                    pieceType: pieceMetadata.pieceType,
                    publishCacheRefresh: false,
                }))
                if (error) {
                    log.debug({ piece: { name: piece.name, version: piece.version } }, '[pieceSyncService#installNewPieces] Piece already exists, skipping')
                }
                else {
                    added++
                }
            })
            if (fetchError) {
                fetchFailed++
                log.warn({ piece: { name: piece.name, version: piece.version } }, 'Piece metadata unavailable after retries; synchronization will continue')
            }
        }))
        if (added > addedAtLastInvalidation && performance.now() - lastInvalidationTime > CACHE_INVALIDATION_INTERVAL_MS) {
            await pieceCache(log).invalidate()
            addedAtLastInvalidation = added
            lastInvalidationTime = performance.now()
        }
    }
    if (added > addedAtLastInvalidation) {
        await pieceCache(log).invalidate()
    }
    return { added, fetchFailed }
}


async function listCloudPieces(): Promise<PieceRegistryResponse[]> {
    const queryParams = new URLSearchParams()
    queryParams.append('edition', system.getEdition())
    queryParams.append('release', apVersionUtil.getCurrentRelease())
    const body = await readCloudText({ url: `${CLOUD_API_URL}/registry?${queryParams.toString()}` })
    const pieces = z.array(z.object({ name: z.string(), version: z.string() })).parse(JSON.parse(body))
    const piecesByName = groupBy(pieces, p => p.name)
    const latest = []
    const others = []

    for (const group of Object.values(piecesByName)) {
        const sortedByVersion = sortByVersionDesc(group)
        latest.push(sortedByVersion[0])
        others.push(...sortedByVersion.slice(1))
    }

    return [...latest, ...others]
}

function sortByVersionDesc(items: PieceRegistryResponse[]) {
    return [...items].sort((a, b) =>
        semver.rcompare(a.version, b.version),
    )
}

async function readCloudText({ url }: { url: string }): Promise<string> {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const { data, error } = await tryCatch(async () => {
            const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
            if (!response.ok) throw new Error(`Piece catalog HTTP ${response.status}`)
            return response.text()
        })
        if (!error) return data
        if (attempt === 3) throw error
        await new Promise(resolve => setTimeout(resolve, attempt * 500))
    }
    throw new Error('Piece catalog request failed')
}

type PieceRegistryResponse = {
    name: string
    version: string
}


type PieceMetadataOnly = Pick<PieceMetadataSchema, 'name' | 'version' | 'pieceType'>
