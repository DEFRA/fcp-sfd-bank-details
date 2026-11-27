import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createServer } from '../../../../src/api/index.js'

describe('API routes', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('GET /bank-details/800000001', () => {
    test('should return 404 because the stub route was removed', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/bank-details/800000001'
      })

      expect(response.statusCode).toBe(404)
    })
  })
})
