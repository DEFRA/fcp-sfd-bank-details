// Test framework dependencies
import { describe, expect, test } from 'vitest'
import { JWKSTimeout, JWTExpired } from 'jose/errors'

// Thing under test
import {
  buildJwksUnavailableLog,
  buildTokenRejectedLog
} from '../../../src/utils/build-jwt-auth-log.js'

// Test helpers
const request = { method: 'get', path: '/bank-details/800000001' }

describe('JWT auth log', () => {
  describe('buildTokenRejectedLog', () => {
    test('should nest every field under the event and error namespaces', () => {
      const err = new JWTExpired('"exp" claim timestamp check failed', {})

      expect(buildTokenRejectedLog(request, err)).toEqual({
        event: {
          type: 'jwt_verification',
          action: 'get',
          category: '/bank-details/800000001',
          outcome: 'failure'
        },
        error: {
          code: 'ERR_JWT_EXPIRED',
          message: '"exp" claim timestamp check failed',
          type: 'JWTExpired'
        }
      })
    })

    test('should omit the stack trace for a rejected token', () => {
      const log = buildTokenRejectedLog(request, new JWTExpired('expired', {}))

      expect(log.error.stack_trace).toBeUndefined()
    })
  })

  describe('buildJwksUnavailableLog', () => {
    test('should nest every field under the event and error namespaces', () => {
      const log = buildJwksUnavailableLog(request, new JWKSTimeout())

      expect(log).toEqual({
        event: {
          type: 'jwt_verification',
          action: 'get',
          category: '/bank-details/800000001',
          outcome: 'failure'
        },
        error: {
          code: 'ERR_JWKS_TIMEOUT',
          message: 'request timed out',
          stack_trace: expect.stringContaining('JWKSTimeout'),
          type: 'JWKSTimeout'
        }
      })
    })

    test('should describe an error that is not a jose error', () => {
      const log = buildJwksUnavailableLog(
        request,
        new TypeError('fetch failed')
      )

      expect(log.error).toEqual({
        code: undefined,
        message: 'fetch failed',
        stack_trace: expect.stringContaining('TypeError'),
        type: 'TypeError'
      })
    })
  })
})
