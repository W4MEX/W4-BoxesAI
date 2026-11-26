import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { templateController } from './template.controller'

export const templateModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(templateController, { prefix: '/v1/templates' })
}