import { health } from '../../../src/routes/health.js'

describe('Health endpoint', () => {
  test('should have the correct method and path', () => {
    expect(health.method).toBe('GET')
    expect(health.path).toBe('/health')
  })

  test('should return a success message', () => {
    const mockH = {
      response: vi.fn().mockReturnValue({ statusCode: 200 })
    }

    const result = health.handler(null, mockH)

    expect(mockH.response).toHaveBeenCalledWith({ message: 'success' })
    expect(result).toEqual({ statusCode: 200 })
  })
})
