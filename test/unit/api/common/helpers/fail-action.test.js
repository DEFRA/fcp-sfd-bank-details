// Test framework dependencies
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Thing under test
import { failAction } from '../../../../../src/api/common/helpers/fail-action.js'

// Test helpers
import { createLogger } from '../../../../../src/logging/logger.js'
import {
  buildPayloadValidationError,
  INVALID_ACCOUNT_NUMBER,
  INVALID_SORT_CODE
} from '../../../../helpers/validation-error.js'

const request = { method: 'post', path: '/bank-details/800000001' }

const captureThrown = (fn) => {
  try {
    fn()
  } catch (err) {
    return err
  }

  throw new Error('Expected the function to throw')
}

describe('#fail-action', () => {
  let warnSpy

  beforeEach(() => {
    warnSpy = vi.spyOn(createLogger(), 'warn')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('should rethrow the same error it was given', () => {
    const err = buildPayloadValidationError()

    expect(captureThrown(() => failAction(request, {}, err))).toBe(err)
  })

  test('should leave the error message and response payload unchanged', () => {
    const err = buildPayloadValidationError()
    const { message } = err
    const payload = structuredClone(err.output.payload)

    captureThrown(() => failAction(request, {}, err))

    expect(err.message).toBe(message)
    expect(err.output.payload).toEqual(payload)
  })

  test('should log the failure as a warning nested under the event and error namespaces', () => {
    captureThrown(() => failAction(request, {}, buildPayloadValidationError()))

    expect(warnSpy).toHaveBeenCalledWith(
      {
        event: expect.objectContaining({
          type: 'request_validation',
          action: 'post',
          category: '/bank-details/800000001',
          outcome: 'failure'
        }),
        error: expect.objectContaining({
          code: 400,
          message: 'Request validation failed',
          type: 'ValidationError'
        })
      },
      'Request validation failed'
    )
  })

  test('should not write the submitted values to the log', () => {
    captureThrown(() => failAction(request, {}, buildPayloadValidationError()))

    const logged = JSON.stringify(warnSpy.mock.calls)

    expect(logged).not.toContain(INVALID_SORT_CODE)
    expect(logged).not.toContain(INVALID_ACCOUNT_NUMBER)
  })
})
