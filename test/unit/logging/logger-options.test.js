// Test framework dependencies
import { describe, expect, test, vi } from 'vitest'

// Things we need to mock
const mockGetTraceId = vi.fn()
vi.mock('@defra/hapi-tracing', () => ({ getTraceId: mockGetTraceId }))

// Thing under test
const { loggerOptions } = await import('../../../src/logging/logger-options.js')

describe('loggerOptions', () => {
  test('should not log the health route', () => {
    expect(loggerOptions.ignorePaths).toContain('/health')
  })

  test('should add the trace id to log entries when one is in scope', () => {
    mockGetTraceId.mockReturnValue('mockTraceId')

    expect(loggerOptions.mixin()).toEqual({ trace: { id: 'mockTraceId' } })
  })

  test('should omit the trace when there is no trace id in scope', () => {
    mockGetTraceId.mockReturnValue(undefined)

    expect(loggerOptions.mixin()).toEqual({})
  })
})
