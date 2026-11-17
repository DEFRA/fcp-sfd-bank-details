// Test framework dependencies
import { describe, expect, test } from 'vitest'

// Thing under test
import { buildUnhandledRejectionLog } from '../../../src/utils/build-unhandled-rejection-log.js'

describe('Unhandled rejection log', () => {
  describe('buildUnhandledRejectionLog', () => {
    test('should nest every field under the event and error namespaces', () => {
      const err = Object.assign(new TypeError('upstream timed out'), {
        code: 'ETIMEDOUT'
      })

      expect(buildUnhandledRejectionLog(err)).toEqual({
        event: {
          type: 'unhandled_rejection',
          outcome: 'failure'
        },
        error: {
          code: 'ETIMEDOUT',
          message: 'upstream timed out',
          stack_trace: expect.stringContaining('TypeError: upstream timed out'),
          type: 'TypeError'
        }
      })
    })

    test('should include the full stack trace for an error', () => {
      const log = buildUnhandledRejectionLog(new Error('upstream timed out'))

      expect(log.error.stack_trace).toMatch(/\n\s+at /)
    })

    test('should describe a rejection with a string by its value and type', () => {
      expect(buildUnhandledRejectionLog('upstream timed out').error).toEqual({
        message: 'upstream timed out',
        type: 'string'
      })
    })

    test('should describe a rejection with no value', () => {
      expect(buildUnhandledRejectionLog(undefined).error).toEqual({
        message: 'undefined',
        type: 'undefined'
      })
    })
  })
})
