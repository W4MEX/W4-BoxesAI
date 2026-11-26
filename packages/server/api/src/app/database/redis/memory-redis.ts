export async function createMemoryRedisConnection(): Promise<never> {
    throw new Error('W4 requires an external Redis-compatible server')
}
