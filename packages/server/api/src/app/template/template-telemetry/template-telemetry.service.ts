import { TemplateTelemetryEvent } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'

// Existing flow operations can call this without exporting template activity.
export const templateTelemetryService = (_log: FastifyBaseLogger) => ({
    sendEvent(_params: { event: TemplateTelemetryEvent, projectId: string }): void { /* disabled */ },
    sendEventForPlatform(_params: { event: TemplateTelemetryEvent, platformId: string | null }): void { /* disabled */ },
})
