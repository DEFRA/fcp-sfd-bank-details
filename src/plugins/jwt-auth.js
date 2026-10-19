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

const createJwtScheme =
  ({ audience, issuer, subject }) =>
  () => ({
    authenticate: async (request, h) => {
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
      } catch (err) {
        request.logger.warn({ code: err.code }, 'JWT verification failed')
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
 * Unless the bypass is enabled this plugin validates AWS WebIdentity JWTs issued to the
 * caller service. It checks the bearer token, verifies the signature against the remote
 * JWKS, and confirms the token issuer, audience, subject and algorithm match the expected
 * values for this service and the allowed upstream caller.
 *
 * When auth.jwt.bypass (JWT_AUTH_BYPASS) is enabled for local development, where the CDP identity
 * provider is not available, this plugin swaps in a permissive scheme that authenticates requests
 * without JWT verification. The bypass is off by default and registration fails if it is enabled
 * when ENVIRONMENT is not local.
 *
 * Verifies calling services using AWS WebIdentity JWTs (see CDP "Service to Service Auth" docs).
 */
export const jwtAuth = {
  plugin: {
    name: 'jwt',
    register: async (server) => {
      const bypass = config.get('auth.jwt.bypass')

      if (bypass && config.get('cdpEnvironment') !== 'local') {
        throw new Error(
          'JWT auth bypass is only permitted when ENVIRONMENT is local'
        )
      }

      if (!bypass) {
        const issuer = config.get('auth.jwt.issuer')
        const jwksUri = config.get('auth.jwt.jwksUri')
        const awsAccount = config.get('auth.jwt.awsAccount')

        if (!issuer || !jwksUri || !awsAccount) {
          throw new Error(
            'JWT auth requires CDP_JWT_ISSUER, CDP_JWT_JWKS_URI and AWS_ACCOUNT unless the local bypass is enabled'
          )
        }

        server.app.JWKS = createRemoteJWKSet(new URL(jwksUri), {
          [customFetch]: (...args) => undici.fetch(args[0], { ...args[1] })
        })
      }

      const scheme = bypass
        ? localScheme
        : createJwtScheme({
            audience: config.get('auth.jwt.audience'),
            issuer: config.get('auth.jwt.issuer'),
            subject: `arn:aws:iam::${config.get('auth.jwt.awsAccount')}:role/${config.get('auth.jwt.allowedCallerServiceName')}`
          })

      server.auth.scheme('jwt-proxy', scheme)
      server.auth.strategy('jwt', 'jwt-proxy')
      server.auth.default('jwt')
    }
  }
}
