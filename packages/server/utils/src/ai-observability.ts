import { ActivepiecesAiBilling } from '@activepieces/core-utils'

export const aiObservability = {
    init: (_options: { enabled: boolean }): void => undefined,
    integration: (): undefined => undefined,
    flush: async (): Promise<void> => undefined,
    reset: (): void => undefined,
    runtimeContextOf: (_options: { billing?: ActivepiecesAiBilling }): AiTraceContext => ({}),
}

export const AI_TRACE_RUNTIME_CONTEXT = { distinctId: true, sessionId: true, groups: true }

export type AiTraceContext = {
    distinctId?: string
    sessionId?: string
    groups?: string
}
