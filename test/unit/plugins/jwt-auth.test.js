// Test framework dependencies
import { vi, beforeEach, describe, test, expect } from 'vitest'
import {
  JOSEError,
  JWKSInvalid,
  JWKSNoMatchingKey,
  JWKSTimeout,
  JWSSignatureVerificationFailed
} from 'jose/errors'

// Things we need to mock
const mockConfigGet = vi.fn()
vi.mock('../../../src/config.js', () => ({
  config: {
    get: mockConfigGet
  }
}))

const mockJwtVerify = vi.fn()
const mockCreateRemoteJWKSet = vi.fn()
vi.mock('jose', () => ({
  jwtVerify: mockJwtVerify,
  createRemoteJWKSet: mockCreateRemoteJWKSet
}))

// Thing under test
const { jwtAuth } = await import('../../../src/plugins/jwt-auth.js')

// Test helpers
const jwksUri = 'https://example.com/.well-known/jwks.json'
const mockJwks = Symbol('jwks')

const buildServer = () => {
  return {
    app: {},
    auth: {
      scheme: vi.fn(),
      strategy: vi.fn(),
      default: vi.fn()
    }
  }
}

const registerWithEnvironment = async (cdpEnvironment, overrides = {}) => {
  const values = {
    'auth.jwt.bypass': cdpEnvironment === 'local',
    'auth.jwt.jwksUri': jwksUri,
    'auth.jwt.issuer': 'mockIssuer',
    'auth.jwt.awsAccount': '123456789012',
    ...overrides
  }

  mockConfigGet.mockImplementation((key) => {
    switch (key) {
      case 'cdpEnvironment':
        return cdpEnvironment
      case 'auth.jwt.bypass':
        return values['auth.jwt.bypass']
      case 'auth.jwt.jwksUri':
        return values['auth.jwt.jwksUri']
      case 'auth.jwt.audience':
        return 'mockAudience'
      case 'auth.jwt.issuer':
        return values['auth.jwt.issuer']
      case 'auth.jwt.awsAccount':
        return values['auth.jwt.awsAccount']
      case 'auth.jwt.allowedCallerServiceName':
        return 'mock-caller'
      default:
        return undefined
    }
  })

  const server = buildServer()
  await jwtAuth.plugin.register(server)

  const [, schemeFactory] = server.auth.scheme.mock.calls[0]

  return { server, scheme: schemeFactory() }
}

describe('jwtAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateRemoteJWKSet.mockReturnValue(mockJwks)
  })

  test('should return an object', () => {
    expect(jwtAuth).toBeInstanceOf(Object)
  })

  test('should name the plugin', () => {
    expect(jwtAuth.plugin.name).toBe('jwt')
  })

  test('should have a register function', () => {
    expect(jwtAuth.plugin.register).toBeInstanceOf(Function)
  })

  describe('when running in a non-local environment', () => {
    test('should register the jwt-proxy scheme', async () => {
      const { server } = await registerWithEnvironment('test')

      expect(server.auth.scheme).toHaveBeenCalledWith(
        'jwt-proxy',
        expect.any(Function)
      )
    })

    test('should register the jwt strategy using the jwt-proxy scheme', async () => {
      const { server } = await registerWithEnvironment('test')

      expect(server.auth.strategy).toHaveBeenCalledWith('jwt', 'jwt-proxy')
    })

    test('should set jwt as the default auth strategy', async () => {
      const { server } = await registerWithEnvironment('test')

      expect(server.auth.default).toHaveBeenCalledWith('jwt')
    })

    test('should set the default strategy after registering it', async () => {
      const { server } = await registerWithEnvironment('test')

      expect(server.auth.strategy.mock.invocationCallOrder[0]).toBeLessThan(
        server.auth.default.mock.invocationCallOrder[0]
      )
    })

    test('should create the remote JWKS from the configured uri', async () => {
      await registerWithEnvironment('test')

      expect(mockCreateRemoteJWKSet).toHaveBeenCalledWith(new URL(jwksUri))
    })

    test('should store the JWKS on server.app', async () => {
      const { server } = await registerWithEnvironment('test')

      expect(server.app.JWKS).toBe(mockJwks)
    })

    test('should leave jose to fetch the JWKS so the request uses the CDP proxy', async () => {
      await registerWithEnvironment('test')

      const [, options] = mockCreateRemoteJWKSet.mock.calls[0]

      expect(options).toBeUndefined()
    })
  })

  describe('when required JWT config is missing', () => {
    test('should fail to register when the issuer is not set', async () => {
      await expect(
        registerWithEnvironment('test', { 'auth.jwt.issuer': null })
      ).rejects.toThrow('JWT auth requires')
    })

    test('should fail to register when the JWKS uri is not set', async () => {
      await expect(
        registerWithEnvironment('test', { 'auth.jwt.jwksUri': null })
      ).rejects.toThrow('JWT auth requires')
    })

    test('should fail to register when the AWS account is not set', async () => {
      await expect(
        registerWithEnvironment('test', { 'auth.jwt.awsAccount': null })
      ).rejects.toThrow('JWT auth requires')
    })
  })

  describe('when the bypass is enabled outside the local environment', () => {
    test('should fail to register', async () => {
      await expect(
        registerWithEnvironment('prod', { 'auth.jwt.bypass': true })
      ).rejects.toThrow('only permitted when ENVIRONMENT is local')
    })
  })

  describe('when running locally without the bypass', () => {
    test('should verify tokens', async () => {
      const { server } = await registerWithEnvironment('local', {
        'auth.jwt.bypass': false
      })

      expect(mockCreateRemoteJWKSet).toHaveBeenCalled()
      expect(server.app.JWKS).toBe(mockJwks)
    })
  })

  describe('jwt scheme', () => {
    const h = { authenticated: vi.fn((result) => result) }

    const buildRequest = (authorization) => {
      return {
        headers: { authorization },
        method: 'get',
        path: '/bank-details/800000001',
        server: { app: { JWKS: mockJwks } },
        logger: { warn: vi.fn(), error: vi.fn() }
      }
    }

    test('should reject a request with no authorization header', async () => {
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest(undefined), h)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 401 }
      })
    })

    test('should reject a request without a Bearer prefix', async () => {
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest('Basic abc'), h)
      ).rejects.toMatchObject({
        output: { statusCode: 401 }
      })
    })

    test('should not verify the token when the header is missing', async () => {
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest(undefined), h)
      ).rejects.toThrow()

      expect(mockJwtVerify).not.toHaveBeenCalled()
    })

    test('should set the Bearer challenge when the header is missing', async () => {
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest(undefined), h)
      ).rejects.toMatchObject({
        output: { headers: { 'WWW-Authenticate': 'Bearer' } }
      })
    })

    test('should verify the token with the expected options', async () => {
      mockJwtVerify.mockResolvedValue({ payload: { sub: 'mockSub' } })
      const { scheme } = await registerWithEnvironment('test')

      await scheme.authenticate(buildRequest('Bearer mockToken'), h)

      expect(mockJwtVerify).toHaveBeenCalledWith('mockToken', mockJwks, {
        issuer: 'mockIssuer',
        audience: 'mockAudience',
        subject: 'arn:aws:iam::123456789012:role/mock-caller',
        algorithms: ['RS256']
      })
    })

    test('should accept a lowercase scheme', async () => {
      mockJwtVerify.mockResolvedValue({ payload: { sub: 'mockSub' } })
      const { scheme } = await registerWithEnvironment('test')

      await scheme.authenticate(buildRequest('bearer mockToken'), h)

      expect(mockJwtVerify).toHaveBeenCalledWith(
        'mockToken',
        mockJwks,
        expect.any(Object)
      )
    })

    test('should accept an uppercase scheme', async () => {
      mockJwtVerify.mockResolvedValue({ payload: { sub: 'mockSub' } })
      const { scheme } = await registerWithEnvironment('test')

      await scheme.authenticate(buildRequest('BEARER mockToken'), h)

      expect(mockJwtVerify).toHaveBeenCalledWith(
        'mockToken',
        mockJwks,
        expect.any(Object)
      )
    })

    test('should accept multiple spaces after the scheme', async () => {
      mockJwtVerify.mockResolvedValue({ payload: { sub: 'mockSub' } })
      const { scheme } = await registerWithEnvironment('test')

      await scheme.authenticate(buildRequest('Bearer   mockToken'), h)

      expect(mockJwtVerify).toHaveBeenCalledWith(
        'mockToken',
        mockJwks,
        expect.any(Object)
      )
    })

    test('should not change the case of the token', async () => {
      mockJwtVerify.mockResolvedValue({ payload: { sub: 'mockSub' } })
      const { scheme } = await registerWithEnvironment('test')

      await scheme.authenticate(buildRequest('bearer MockToken'), h)

      expect(mockJwtVerify).toHaveBeenCalledWith(
        'MockToken',
        mockJwks,
        expect.any(Object)
      )
    })

    test('should reject a header with no token', async () => {
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest('Bearer '), h)
      ).rejects.toMatchObject({ output: { statusCode: 401 } })

      expect(mockJwtVerify).not.toHaveBeenCalled()
    })

    test('should reject a header with no space between scheme and token', async () => {
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest('BearermockToken'), h)
      ).rejects.toMatchObject({ output: { statusCode: 401 } })

      expect(mockJwtVerify).not.toHaveBeenCalled()
    })

    test('should reject a header with extra parts after the token', async () => {
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest('Bearer mockToken extra'), h)
      ).rejects.toMatchObject({ output: { statusCode: 401 } })

      expect(mockJwtVerify).not.toHaveBeenCalled()
    })

    test('should authenticate with the token payload as credentials', async () => {
      const payload = { sub: 'mockSub', iss: 'mockIssuer' }
      const protectedHeader = { alg: 'RS256', kid: 'mockKid' }
      mockJwtVerify.mockResolvedValue({ payload, protectedHeader })
      const { scheme } = await registerWithEnvironment('test')

      const result = await scheme.authenticate(
        buildRequest('Bearer mockToken'),
        h
      )

      const expected = {
        credentials: {
          token: payload,
          sub: 'mockSub',
          serviceName: undefined
        },
        artifacts: { protectedHeader, payload }
      }

      expect(h.authenticated).toHaveBeenCalledWith(expected)
      expect(result).toEqual(expected)
    })

    test('should expose the calling service name from the sts claim', async () => {
      const payload = {
        sub: 'mockSub',
        'https://sts.amazonaws.com/': {
          principal_tags: { ServiceName: 'fcp-sfd-frontend' }
        }
      }
      mockJwtVerify.mockResolvedValue({ payload, protectedHeader: {} })
      const { scheme } = await registerWithEnvironment('test')

      const result = await scheme.authenticate(
        buildRequest('Bearer mockToken'),
        h
      )

      expect(result.credentials.serviceName).toBe('fcp-sfd-frontend')
    })

    test('should reject with a generic 401 when verification fails', async () => {
      mockJwtVerify.mockRejectedValue(
        new JWSSignatureVerificationFailed('signature verification failed')
      )
      const { scheme } = await registerWithEnvironment('test')
      const request = buildRequest('Bearer mockToken')

      await expect(scheme.authenticate(request, h)).rejects.toMatchObject({
        message: 'Invalid token',
        output: { statusCode: 401 }
      })
      expect(request.logger.warn).toHaveBeenCalledWith(
        {
          event: {
            type: 'jwt_verification',
            action: 'get',
            category: '/bank-details/800000001',
            outcome: 'failure'
          },
          error: {
            code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
            message: 'signature verification failed',
            type: 'JWSSignatureVerificationFailed'
          }
        },
        'JWT verification failed'
      )
    })

    test('should reject with a 401 when the token is signed with a key that is not in the jwks', async () => {
      mockJwtVerify.mockRejectedValue(new JWKSNoMatchingKey())
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest('Bearer mockToken'), h)
      ).rejects.toMatchObject({ output: { statusCode: 401 } })
    })

    test('should reject with a 503 when the jwks request times out', async () => {
      mockJwtVerify.mockRejectedValue(new JWKSTimeout())
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest('Bearer mockToken'), h)
      ).rejects.toMatchObject({
        message: 'Unable to verify token',
        output: { statusCode: 503 }
      })
    })

    test('should reject with a 503 when the jwks is malformed', async () => {
      mockJwtVerify.mockRejectedValue(new JWKSInvalid('bad jwks'))
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest('Bearer mockToken'), h)
      ).rejects.toMatchObject({
        message: 'Unable to verify token',
        output: { statusCode: 503 }
      })
    })

    test('should reject with a 503 when the jwks cannot be read', async () => {
      mockJwtVerify.mockRejectedValue(new JOSEError('request failed'))
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest('Bearer mockToken'), h)
      ).rejects.toMatchObject({
        message: 'Unable to verify token',
        output: { statusCode: 503 }
      })
    })

    test('should reject with a 503 when the jwks host is unreachable', async () => {
      mockJwtVerify.mockRejectedValue(new TypeError('fetch failed'))
      const { scheme } = await registerWithEnvironment('test')

      await expect(
        scheme.authenticate(buildRequest('Bearer mockToken'), h)
      ).rejects.toMatchObject({
        message: 'Unable to verify token',
        output: { statusCode: 503 }
      })
    })

    test('should log a jwks failure as an error with a stack trace', async () => {
      mockJwtVerify.mockRejectedValue(new JWKSTimeout())
      const { scheme } = await registerWithEnvironment('test')
      const request = buildRequest('Bearer mockToken')

      await expect(scheme.authenticate(request, h)).rejects.toThrow()

      expect(request.logger.error).toHaveBeenCalledWith(
        {
          event: {
            type: 'jwt_verification',
            action: 'get',
            category: '/bank-details/800000001',
            outcome: 'failure'
          },
          error: {
            code: 'ERR_JWKS_TIMEOUT',
            message: 'request timed out',
            stack_trace: expect.any(String),
            type: 'JWKSTimeout'
          }
        },
        'Could not verify JWT, the JSON Web Key Set was unavailable'
      )
    })

    test('should not log a jwks failure as a token rejection', async () => {
      mockJwtVerify.mockRejectedValue(new JWKSTimeout())
      const { scheme } = await registerWithEnvironment('test')
      const request = buildRequest('Bearer mockToken')

      await expect(scheme.authenticate(request, h)).rejects.toThrow()

      expect(request.logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('when running in the local environment', () => {
    test('should register the jwt-proxy scheme', async () => {
      const { server } = await registerWithEnvironment('local')

      expect(server.auth.scheme).toHaveBeenCalledWith(
        'jwt-proxy',
        expect.any(Function)
      )
    })

    test('should register the jwt strategy using the jwt-proxy scheme', async () => {
      const { server } = await registerWithEnvironment('local')

      expect(server.auth.strategy).toHaveBeenCalledWith('jwt', 'jwt-proxy')
    })

    test('should set jwt as the default auth strategy', async () => {
      const { server } = await registerWithEnvironment('local')

      expect(server.auth.default).toHaveBeenCalledWith('jwt')
    })

    test('should not create a remote JWKS', async () => {
      const { server } = await registerWithEnvironment('local')

      expect(mockCreateRemoteJWKSet).not.toHaveBeenCalled()
      expect(server.app.JWKS).toBeUndefined()
    })

    test('should authenticate requests without verifying a token', async () => {
      const { scheme } = await registerWithEnvironment('local')
      const h = { authenticated: vi.fn().mockReturnValue('authenticated') }

      const result = scheme.authenticate({ headers: {} }, h)

      expect(h.authenticated).toHaveBeenCalledWith({ credentials: {} })
      expect(result).toBe('authenticated')
      expect(mockJwtVerify).not.toHaveBeenCalled()
    })
  })
})
