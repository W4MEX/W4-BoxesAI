import { FastifyBaseLogger } from 'fastify'

export const exceptionHandler = {
    handle: (error: unknown, log: FastifyBaseLogger): void => {
        log.error({ error }, 'Unhandled exception')
    },
    captureException: (_error: unknown): void => { /* External reporting is disabled in W4. */ },
}
