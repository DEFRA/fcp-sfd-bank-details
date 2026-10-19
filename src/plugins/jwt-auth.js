/**
 * JWT auth for service-to-service calls.
 *
 * This plugin provides the "jwt-auth" (JSON Web Token) strategy used by Hapi routes to verify incoming
 * calls from trusted internal services. In CDP, service-to-service auth is based on AWS
 * WebIdentity JWTs: a caller service obtains a signed token from AWS, sends it in the
 * Authorization header, and this service validates that token before allowing access.
 *
 * The validation flow is:
 * 1. Read the bearer token from the Authorization header.
 * 2. Verify the token signature against the remote JWKS published by the identity provider.
 * 3. Check the token issuer, audience, subject and algorithm match the expected values for
 *    this service and the permitted caller role.
 * 4. If valid, authenticate the request; if not, reject with a 401.
 *
 * In local development, the environment does not have a real AWS identity provider issuing
 * WebIdentity tokens, so the plugin falls back to a permissive local scheme that allows the
 * request through without JWT verification. This keeps local development working without
 * weakening the real production auth path.
 */

import Boom from '@hapi/boom'
import { jwtVerify, createRemoteJWKSet, customFetch } from 'jose'
import * as undici from 'undici'
import { config } from '../config.js'

const jwtScheme = () => ({
  authenticate: async (request, h) => {
    const audience = config.get('auth.jwt.audience')
    const issuer = config.get('auth.jwt.issuer')
    const awsAccount = config.get('auth.jwt.awsAccount')
    const allowedCallerServiceName = config.get('auth.jwt.allowedCallerServiceName')
    const subject = `arn:aws:iam::${awsAccount}:role/${allowedCallerServiceName}`

    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      throw Boom.unauthorized(null, 'Bearer')
    }

    const token = authHeader.slice('Bearer '.length)

    try {
      const { payload } = await jwtVerify(token, request.server.app.JWKS, {
        issuer,
        audience,
        subject,
        algorithms: ['RS256']
      })

      return h.authenticated({
        credentials: {
          token: payload,
          sub: payload.sub
        }
      })
    } catch {
      throw Boom.unauthorized('Invalid token', 'Bearer')
    }
  }
})

// Locally there's no AWS identity provider to issue callers a WebIdentity JWT, so requests are trusted unverified.
const localScheme = () => ({
  authenticate: (_request, h) => h.authenticated({ credentials: {} })
})

/**
 * Registers the JWT auth strategy used to protect service-to-service endpoints.
 *
 * In non-local environments this plugin validates AWS WebIdentity JWTs issued to the
 * caller service. It checks the bearer token, verifies the signature against the remote
 * JWKS, and confirms the token issuer, audience, subject and algorithm match the expected
 * values for this service and the allowed upstream caller.
 *
 * In local development the CDP identity provider is not available, so this plugin swaps in
 * a permissive scheme that authenticates requests without JWT verification. That bypass is
 * intentionally limited to the local environment and must never be used in a shared or
 * deployed environment.
 *
 * Verifies calling services using AWS WebIdentity JWTs (see CDP "Service to Service Auth" docs).
 */
export const jwtAuth = {
  plugin: {
    name: 'jwt',
    register: async (server) => {
      const isLocal = config.get('cdpEnvironment') === 'local'

      if (isLocal) {
        server.auth.scheme('jwt-proxy', localScheme)
        server.auth.strategy('jwt', 'jwt-proxy')
        server.auth.default('jwt')

        return
      }

      const jwksUri = config.get('auth.jwt.jwksUri')

      server.app.JWKS = createRemoteJWKSet(new URL(jwksUri), {
        [customFetch]: (...args) => undici.fetch(args[0], { ...args[1] })
      })

      server.auth.scheme('jwt-proxy', jwtScheme)
      server.auth.strategy('jwt', 'jwt-proxy')
      server.auth.default('jwt')
    }
  }
}
