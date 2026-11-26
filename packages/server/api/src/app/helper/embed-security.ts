import { FastifyBaseLogger } from 'fastify'

export const embedSecurity = (_log: FastifyBaseLogger) => ({
    async getFrameAncestorsHeader(_params: { hostname: string }): Promise<string> {
        return 'frame-ancestors \'self\''
    },
})
