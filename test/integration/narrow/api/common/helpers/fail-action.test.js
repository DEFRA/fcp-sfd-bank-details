// Test framework dependencies
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

// Thing under test
import { createServer } from '../../../../../../src/api/index.js'

// Test helpers
import { createLogger } from '../../../../../../src/logging/logger.js'
import {
  bankDetailsSchema,
  INVALID_ACCOUNT_NUMBER,
  INVALID_SORT_CODE,
  invalidBankDetailsPayload
} from '../../../../../helpers/validation-error.js'

const VALIDATED_ROUTE = '/test/validated-payload'

describe('Shared validation failAction', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    server.route({
      method: 'POST',
      path: VALIDATED_ROUTE,
      options: {
        auth: false,
        validate: { payload: bankDetailsSchema }
      },
      handler: () => ({ message: 'success' })
    })
    await server.initialize()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await server.stop()
  })

  const injectInvalidPayload = () => {
    return server.inject({
      method: 'POST',
      url: VALIDATED_ROUTE,
      payload: invalidBankDetailsPayload
    })
  }

  test('should return the standard Hapi 400 response for an invalid payload', async () => {
    const response = await injectInvalidPayload()

    expect(response.statusCode).toBe(400)
    expect(response.result).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: expect.any(String),
      validation: {
        source: 'payload',
        keys: ['sortCode', 'accountNumber']
      }
    })
  })

  test('should log the failure without the submitted values', async () => {
    const warnSpy = vi.spyOn(createLogger(), 'warn')

    await injectInvalidPayload()

    const logged = JSON.stringify(warnSpy.mock.calls)

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0].event.reason).toBe(
      'payload: sortCode (string.pattern.base), accountNumber (string.length)'
    )
    expect(logged).not.toContain(INVALID_SORT_CODE)
    expect(logged).not.toContain(INVALID_ACCOUNT_NUMBER)
  })
})
