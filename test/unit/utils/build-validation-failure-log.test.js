// Test framework dependencies
import { describe, expect, test } from 'vitest'

// Thing under test
import { buildValidationFailureLog } from '../../../src/utils/build-validation-failure-log.js'

// Test helpers
import {
  buildPayloadValidationError,
  INVALID_ACCOUNT_NUMBER,
  INVALID_SORT_CODE
} from '../../helpers/validation-error.js'

const request = { method: 'post', path: '/bank-details/800000001' }

describe('Validation failure log', () => {
  describe('buildValidationFailureLog', () => {
    test('should nest every field under the event and error namespaces', () => {
      const log = buildValidationFailureLog(request, buildPayloadValidationError())

      expect(log).toEqual({
        event: {
          type: 'request_validation',
          action: 'post',
          category: '/bank-details/800000001',
          outcome: 'failure',
          reason: 'payload: sortCode (string.pattern.base), accountNumber (string.length)'
        },
        error: {
          code: 400,
          message: 'Request validation failed',
          type: 'ValidationError'
        }
      })
    })

    test('should never write the submitted values to the log', () => {
      const err = buildPayloadValidationError({ errors: { stack: true } })

      const serialised = JSON.stringify(buildValidationFailureLog(request, err))

      expect(err.message).toContain(INVALID_SORT_CODE)
      expect(serialised).not.toContain(INVALID_SORT_CODE)
      expect(serialised).not.toContain(INVALID_ACCOUNT_NUMBER)
    })

    test('should omit the stack trace when Joi built the error without stack frames', () => {
      const log = buildValidationFailureLog(request, buildPayloadValidationError())

      expect(log.error).not.toHaveProperty('stack_trace', expect.anything())
    })

    test('should keep only the stack frames when the Joi error has them', () => {
      const err = buildPayloadValidationError({ errors: { stack: true } })

      const { stack_trace: stackTrace } = buildValidationFailureLog(request, err).error

      expect(stackTrace).toMatch(/^\s+at /)
      expect(stackTrace).not.toContain(err.message)
    })

    test('should describe an error thrown by a custom validate function by its type and frames', () => {
      const log = buildValidationFailureLog(request, new TypeError('custom check failed'))

      expect(log.event.reason).toBeUndefined()
      expect(log.error).toEqual({
        code: undefined,
        message: 'Request validation failed',
        stack_trace: expect.stringMatching(/^\s+at /),
        type: 'TypeError'
      })
    })

    test('should omit the stack trace when the message was changed after the stack was formatted', () => {
      const err = new Error('original message')
      expect(err.stack).toContain('original message')
      err.message = 'changed message'

      const log = buildValidationFailureLog(request, err)

      expect(log.error.stack_trace).toBeUndefined()
    })

    test('should list at most ten fields and count the rest', () => {
      const details = Array.from({ length: 12 }, (_, index) => {
        return { path: ['field' + index], type: 'any.required' }
      })
      const err = Object.assign(new Error('validation failed'), { details })

      const { reason } = buildValidationFailureLog(request, err).event

      expect(reason).toMatch(/^field0 \(any\.required\), /)
      expect(reason).toMatch(/field9 \(any\.required\), and 2 more$/)
      expect(reason).not.toContain('field10')
    })

    test('should join nested field paths with dots', () => {
      const details = [{ path: ['address', 'lines', 0], type: 'string.empty' }]
      const err = Object.assign(new Error('validation failed'), { details })

      const log = buildValidationFailureLog(request, err)

      expect(log.event.reason).toBe('address.lines.0 (string.empty)')
    })
  })
})
