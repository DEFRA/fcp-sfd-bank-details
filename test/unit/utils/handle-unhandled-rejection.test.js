// Test framework dependencies
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Thing under test
import { handleUnhandledRejection } from '../../../src/utils/handle-unhandled-rejection.js'

// Test helpers
import { createLogger } from '../../../src/logging/logger.js'

describe('handleUnhandledRejection', () => {
  let originalExitCode
  let errorSpy

  beforeEach(() => {
    originalExitCode = process.exitCode
    errorSpy = vi.spyOn(createLogger(), 'error')
  })

  afterEach(() => {
    process.exitCode = originalExitCode
    vi.restoreAllMocks()
  })

  test('should log the rejection once, nested under the event and error namespaces', () => {
    handleUnhandledRejection(new Error('upstream timed out'))

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      {
        event: { type: 'unhandled_rejection', outcome: 'failure' },
        error: {
          code: undefined,
          message: 'upstream timed out',
          stack_trace: expect.stringContaining('Error: upstream timed out'),
          type: 'Error'
        }
      },
      'Unhandled rejection'
    )
  })

  test('should not pass the raw error to the logger', () => {
    const err = new Error('upstream timed out')

    handleUnhandledRejection(err)

    expect(errorSpy.mock.calls[0][0]).not.toBe(err)
  })

  test('should set a failure exit code', () => {
    handleUnhandledRejection(new Error('upstream timed out'))

    expect(process.exitCode).toBe(1)
  })
})
