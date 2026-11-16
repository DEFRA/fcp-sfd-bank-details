// Test framework dependencies
import {
  SignJWT,
  UnsecuredJWT,
  generateKeyPair,
  createLocalJWKSet,
  exportJWK
} from 'jose'
import { JWKSTimeout } from 'jose/errors'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

// Test helpers
const issuer = 'https://issuer.example.com'
const awsAccount = '123456789012'
const callerSubject = `arn:aws:iam::${awsAccount}:role/fcp-sfd-frontend`
// Synthetic SBI, in the 800000000 to 899999999 range reserved for test data.
const protectedPath = '/bank-details/800000001'

vi.stubEnv('ENVIRONMENT', 'test')
vi.stubEnv('JWT_AUTH_BYPASS', 'false')
vi.stubEnv('CDP_JWT_ISSUER', issuer)
vi.stubEnv('CDP_JWT_JWKS_URI', 'https://issuer.example.com/jwks.json')
vi.stubEnv('AWS_ACCOUNT', awsAccount)

// Things we need to mock
//
// The real JWKS would be fetched from AWS over the network, so a locally generated one is
// served instead. Tests that need the lookup itself to fail swap this out for the test.
let resolveJwks
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    createRemoteJWKSet: () => {
      return (...args) => {
        return resolveJwks(...args)
      }
    }
  }
})

// Thing under test
const { createServer } = await import('../../../../src/server.js')

describe('jwt auth with real tokens', () => {
  let server
  let privateKey
  let otherPrivateKey
  let localJwks

  const sign = ({
    sub = callerSubject,
    iss = issuer,
    aud = 'fcp-sfd-bank-details',
    exp = '5m',
    alg = 'RS256',
    kid = 'test-key',
    nbf,
    key
  } = {}) => {
    const jwt = new SignJWT({})
      .setProtectedHeader({ alg, kid })
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(exp)

    if (sub) {
      jwt.setSubject(sub)
    }

    if (nbf) {
      jwt.setNotBefore(nbf)
    }

    return jwt.sign(key ?? privateKey)
  }

  const get = (path, token) => {
    return server.inject({
      method: 'GET',
      url: path,
      headers: token ? { authorization: `Bearer ${token}` } : {}
    })
  }

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256')
    privateKey = pair.privateKey
    otherPrivateKey = (await generateKeyPair('RS256')).privateKey
    const jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'test-key',
      alg: 'RS256'
    }
    localJwks = createLocalJWKSet({ keys: [jwk] })
    resolveJwks = localJwks

    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  test('should allow a valid token from the allowed caller', async () => {
    const response = await get(protectedPath, await sign())

    expect(response.statusCode).toBe(200)
  })

  test('should return 401 for a protected route without a token', async () => {
    const response = await get(protectedPath)

    expect(response.statusCode).toBe(401)
  })

  test('should allow the health route without a token', async () => {
    const response = await get('/health')

    expect(response.statusCode).toBe(200)
  })

  test('should return 401 for a token with the wrong issuer', async () => {
    const response = await get(
      protectedPath,
      await sign({ iss: 'https://evil.example.com' })
    )

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token with the wrong audience', async () => {
    const response = await get(
      protectedPath,
      await sign({ aud: 'another-service' })
    )

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token with the wrong subject', async () => {
    const response = await get(
      protectedPath,
      await sign({ sub: `arn:aws:iam::${awsAccount}:role/other-service` })
    )

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token with an expired', async () => {
    const response = await get(
      protectedPath,
      await sign({ exp: Math.floor(Date.now() / 1000) - 60 })
    )

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token signed with an unknown key', async () => {
    const token = await sign({ key: otherPrivateKey })
    const response = await get(protectedPath, token)

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token using an unsupported algorithm', async () => {
    const { privateKey: rs384Key } = await generateKeyPair('RS384')
    const token = await sign({ alg: 'RS384', key: rs384Key })
    const response = await get(protectedPath, token)

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token with no subject', async () => {
    const response = await get(protectedPath, await sign({ sub: null }))

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token that is not yet valid', async () => {
    const response = await get(protectedPath, await sign({ nbf: '5m' }))

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for an unsigned token', async () => {
    const token = new UnsecuredJWT({})
      .setSubject(callerSubject)
      .setIssuer(issuer)
      .setAudience('fcp-sfd-bank-details')
      .setIssuedAt()
      .setExpirationTime('5m')
      .encode()
    const response = await get(protectedPath, token)

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a symmetrically signed token', async () => {
    const token = await sign({
      alg: 'HS256',
      key: new TextEncoder().encode('not-a-real-secret-for-tests-only')
    })
    const response = await get(protectedPath, token)

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token whose key id is not in the jwks', async () => {
    const response = await get(
      protectedPath,
      await sign({ kid: 'unknown-key' })
    )

    expect(response.statusCode).toBe(401)
  })

  test('should return 503 when the jwks cannot be retrieved', async () => {
    resolveJwks = () => {
      throw new JWKSTimeout()
    }

    try {
      const response = await get(protectedPath, await sign())

      expect(response.statusCode).toBe(503)
    } finally {
      resolveJwks = localJwks
    }
  })

  test('should protect /example with the default strategy', async () => {
    const unauthenticated = await get('/example')
    const authenticated = await get('/example', await sign())

    expect(unauthenticated.statusCode).toBe(401)
    expect(authenticated.statusCode).toBe(200)
  })

  test('should protect /example/{id} with the default strategy', async () => {
    const unauthenticated = await get('/example/1')
    const authenticated = await get('/example/1', await sign())

    expect(unauthenticated.statusCode).toBe(401)
    expect(authenticated.statusCode).toBe(200)
  })
})
