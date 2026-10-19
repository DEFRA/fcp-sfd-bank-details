import Hapi from '@hapi/hapi'
import { SignJWT, generateKeyPair, createLocalJWKSet, exportJWK } from 'jose'
import { beforeAll, describe, expect, test, vi } from 'vitest'

const issuer = 'https://issuer.example.com'
const awsAccount = '123456789012'
const callerSubject = `arn:aws:iam::${awsAccount}:role/fcp-sfd-frontend`

const mockConfig = {
  cdpEnvironment: 'test',
  'auth.jwt.bypass': false,
  'auth.jwt.audience': 'fcp-sfd-bank-details',
  'auth.jwt.issuer': issuer,
  'auth.jwt.jwksUri': 'https://issuer.example.com/jwks.json',
  'auth.jwt.awsAccount': awsAccount,
  'auth.jwt.allowedCallerServiceName': 'fcp-sfd-frontend'
}

vi.mock('../../../src/config.js', () => ({
  config: { get: (key) => mockConfig[key] }
}))

let mockJwks
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal()

  return { ...actual, createRemoteJWKSet: () => mockJwks }
})

const { jwtAuth } = await import('../../../src/plugins/jwt-auth.js')
const { router } = await import('../../../src/plugins/router.js')

describe('jwt auth with real tokens', () => {
  let server
  let privateKey
  let otherPrivateKey

  const sign = (
    { sub = callerSubject, iss = issuer, aud = 'fcp-sfd-bank-details', exp = '5m', alg = 'RS256', key } = {}
  ) =>
    new SignJWT({})
      .setProtectedHeader({ alg, kid: 'test-key' })
      .setSubject(sub)
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(key ?? privateKey)

  const get = (path, token) =>
    server.inject({
      method: 'GET',
      url: path,
      headers: token ? { authorization: `Bearer ${token}` } : {}
    })

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256')
    privateKey = pair.privateKey
    otherPrivateKey = (await generateKeyPair('RS256')).privateKey
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' }
    mockJwks = createLocalJWKSet({ keys: [jwk] })

    server = Hapi.server()
    await server.register([jwtAuth, router])
    await server.initialize()
  })

  test('should allow a valid token from the allowed caller', async () => {
    const response = await get('/bank-details/107183280', await sign())

    expect(response.statusCode).toBe(200)
  })

  test('should return 401 for a protected route without a token', async () => {
    const response = await get('/bank-details/107183280')

    expect(response.statusCode).toBe(401)
  })

  test('should allow the health route without a token', async () => {
    const response = await get('/health')

    expect(response.statusCode).toBe(200)
  })

  test('should return 401 for a token with the wrong issuer', async () => {
    const response = await get('/bank-details/107183280', await sign({ iss: 'https://evil.example.com' }))

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token with the wrong audience', async () => {
    const response = await get('/bank-details/107183280', await sign({ aud: 'another-service' }))

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token with the wrong subject', async () => {
    const response = await get('/bank-details/107183280', await sign({ sub: `arn:aws:iam::${awsAccount}:role/other-service` }))

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token with an expired', async () => {
    const response = await get('/bank-details/107183280', await sign({ exp: Math.floor(Date.now() / 1000) - 60 }))

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token signed with an unknown key', async () => {
    const token = await sign({ key: otherPrivateKey })
    const response = await get('/bank-details/107183280', token)

    expect(response.statusCode).toBe(401)
  })

  test('should return 401 for a token using an unsupported algorithm', async () => {
    const { privateKey: rs384Key } = await generateKeyPair('RS384')
    const token = await sign({ alg: 'RS384', key: rs384Key })
    const response = await get('/bank-details/107183280', token)

    expect(response.statusCode).toBe(401)
  })
})
