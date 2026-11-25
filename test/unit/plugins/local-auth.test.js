import { beforeEach, describe, expect, test, vi } from 'vitest'

const mockConfigGet = vi.fn()
vi.mock('../../../src/config/index.js', () => ({
  config: { get: mockConfigGet }
}))

const { localAuth } = await import('../../../src/plugins/local-auth.js')

const buildServer = () => ({
  app: {},
  auth: {
    scheme: vi.fn(),
    strategy: vi.fn(),
    default: vi.fn()
  },
  logger: { warn: vi.fn() }
})

const registerLocalAuth = async (server) => {
  await localAuth.plugin.register(server)
  const [, schemeFactory] = server.auth.scheme.mock.calls[0]
  return schemeFactory()
}

describe('localAuth', () => {
  beforeEach(() => {
    mockConfigGet.mockImplementation((key) => {
      if (key === 'cdpEnvironment') {
        return 'local'
      }
      if (key === 'auth.jwt.allowedCallerServiceName') {
        return 'mock-caller'
      }
    })
  })

  test('should fail to register outside the local environment', async () => {
    mockConfigGet.mockReturnValue('prod')
    const server = buildServer()

    await expect(localAuth.plugin.register(server)).rejects.toThrow(
      'JWT auth bypass is only permitted when ENVIRONMENT is local'
    )
    expect(server.auth.scheme).not.toHaveBeenCalled()
    expect(server.logger.warn).not.toHaveBeenCalled()
  })

  test('should register jwt as the default strategy without creating a JWKS', async () => {
    const server = buildServer()
    await registerLocalAuth(server)

    expect(server.auth.scheme).toHaveBeenCalledWith('jwt-proxy', expect.any(Function))
    expect(server.auth.strategy).toHaveBeenCalledWith('jwt', 'jwt-proxy')
    expect(server.auth.default).toHaveBeenCalledWith('jwt')
    expect(server.app.JWKS).toBeUndefined()
  })

  test('should log a warning that requests are not verified', async () => {
    const server = buildServer()
    await registerLocalAuth(server)

    expect(server.logger.warn).toHaveBeenCalledWith(
      { event: { type: 'jwt_verification', action: 'bypass_enabled' } },
      'JWT auth bypass is enabled, incoming requests are not verified'
    )
  })

  test('should authenticate without a token as the allowed caller', async () => {
    const scheme = await registerLocalAuth(buildServer())
    const h = { authenticated: vi.fn().mockReturnValue('authenticated') }

    const result = scheme.authenticate({ headers: {} }, h)

    expect(result).toBe('authenticated')
    expect(h.authenticated).toHaveBeenCalledWith({
      credentials: {
        token: {
          sub: 'arn:aws:iam::000000000000:role/mock-caller',
          'https://sts.amazonaws.com/': {
            principal_tags: { ServiceName: 'mock-caller' }
          }
        },
        sub: 'arn:aws:iam::000000000000:role/mock-caller',
        serviceName: 'mock-caller'
      }
    })
  })

  test('should give each request independent credentials', async () => {
    const scheme = await registerLocalAuth(buildServer())
    const h = { authenticated: vi.fn() }

    scheme.authenticate({ headers: {} }, h)
    scheme.authenticate({ headers: {} }, h)

    const [[first], [second]] = h.authenticated.mock.calls
    first.credentials.token['https://sts.amazonaws.com/'].principal_tags.ServiceName = 'changed'

    expect(second.credentials.serviceName).toBe('mock-caller')
    expect(second.credentials.token['https://sts.amazonaws.com/'].principal_tags.ServiceName).toBe('mock-caller')
  })
})
