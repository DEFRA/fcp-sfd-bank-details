import { describe, expect, test, vi } from 'vitest'

vi.stubEnv('ENVIRONMENT', 'dev')
vi.stubEnv('JWT_AUTH_BYPASS', 'true')

const { createServer } = await import('../../../../src/api/index.js')

describe('server auth selection', () => {
  test('should refuse to start with the bypass enabled outside local', async () => {
    await expect(createServer()).rejects.toThrow(
      'JWT auth bypass is only permitted when ENVIRONMENT is local'
    )
  })
})
