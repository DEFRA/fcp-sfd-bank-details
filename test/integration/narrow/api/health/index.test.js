import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createServer } from '../../../../../src/api/index.js'

describe('GET /health', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  test('should return 200 with a success message', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({ message: 'success' })
  })
})
