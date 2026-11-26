import { ActivepiecesError, ErrorCode } from '@activepieces/core-utils'
import { FastifyBaseLogger } from 'fastify'

export function containsSecretManagerReference(value: unknown): boolean {
    if (typeof value === 'string') return /\{\{[^}]*secret|\$\{[^}]*secret|secretManager/i.test(value)
    if (Array.isArray(value)) return value.some(containsSecretManagerReference)
    if (value && typeof value === 'object') return Object.values(value).some(containsSecretManagerReference)
    return false
}

function requireLocalValue<T>(value: T): T {
    if (containsSecretManagerReference(value)) {
        throw new ActivepiecesError({ code: ErrorCode.FEATURE_DISABLED, params: { message: 'External secret managers are not configured in W4; use a project connection' } })
    }
    return value
}

export const secretManagersService = (_log: FastifyBaseLogger) => ({
    async resolveObject<T>({ value }: { value: T, platformId: string, projectIds?: string[], throwOnFailure?: boolean }): Promise<T> {
        return requireLocalValue(value)
    },
    async resolveString({ key }: { key: string, platformId: string, projectIds?: string[], throwOnFailure?: boolean }): Promise<string> {
        return requireLocalValue(key)
    },
})
