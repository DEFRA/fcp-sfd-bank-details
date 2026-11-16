import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createServer } from '../../../../../src/api/index.js'

// Synthetic SBI, in the 800000000 to 899999999 range reserved for test data.
const sbi = '800000001'

describe('GET /bank-details/{sbi}', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  test('should return 200 with the bank details for the SBI', async () => {
    const response = await server.inject({ method: 'GET', url: `/bank-details/${sbi}` })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      sbi,
      accountName: 'J R Farmer & Son',
      accountNumber: '12345678',
      sortCode: '12-34-56',
      bankName: 'Barclays'
    })
  })

  test('should return 404 when no SBI is given', async () => {
    const response = await server.inject({ method: 'GET', url: '/bank-details/' })

    expect(response.statusCode).toBe(404)
  })
})
