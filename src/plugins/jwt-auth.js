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
 * The JWKS is published on a public AWS host, so fetching it has to leave the CDP network
 * via the forward proxy. CDP injects NODE_USE_ENV_PROXY, HTTPS_PROXY and NO_PROXY into
 * every container, and Node routes outbound requests made with the global fetch through
 * the proxy on the strength of those variables. jose uses the global fetch by default, so
 * no proxy wiring is needed here. Overriding jose's fetch with a client that has no proxy
 * dispatcher (for example the undici package) would send the request direct and it would
 * not get out of the network.
 *
 * In local development, the environment does not have a real AWS identity provider issuing
 * WebIdentity tokens, so the plugin falls back to a permissive local scheme that allows the
 * request through without JWT verification. It authenticates every request as the allowed
 * caller, with synthetic credentials in the same shape as the real path (token, sub and
 * serviceName), so code reading request.auth.credentials behaves the same locally. This keeps
 * local development working without weakening the real production auth path.
 */

import Boom from '@hapi/boom'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { JOSEError, JWKSInvalid, JWKSTimeout } from 'jose/errors'
import {
  buildJwksUnavailableLog,
  buildJwtBypassEnabledLog,
  buildTokenRejectedLog
} from '../utils/build-jwt-auth-log.js'
import { config } from '../config/index.js'

// Claim AWS STS adds to a WebIdentity token, carrying the caller's principal id and tags.
const STS_CLAIM = 'https://sts.amazonaws.com/'

// Deliberately fake account for the local caller's role ARN, so it is never mistaken for a real identity.
const LOCAL_AWS_ACCOUNT = '000000000000'

const buildCallerRoleArn = (awsAccount, serviceName) => {
  return `arn:aws:iam::${awsAccount}:role/${serviceName}`
}

// Failures that mean the JWKS could not be read or trusted, rather than that the caller
// presented a bad token. Reporting these as 401 would hide an outage behind an auth error.
const UPSTREAM_ERROR_CODES = new Set([
  JOSEError.code,
  JWKSInvalid.code,
  JWKSTimeout.code
])

const isUpstreamFailure = (err) => {
  if (!(err instanceof JOSEError)) {
    return true
  }

  return UPSTREAM_ERROR_CODES.has(err.code)
}

const authenticateToken = async (request, h, options) => {
  const { audience, issuer, subject } = options

  const match = request.headers.authorization?.match(/^Bearer +(\S+)$/i)

  if (!match) {
    throw Boom.unauthorized(null, 'Bearer')
  }

  const token = match[1]
  const { JWKS } = request.server.app

  try {
    const { payload, protectedHeader } = await jwtVerify(token, JWKS, {
      issuer,
      audience,
      subject,
      algorithms: ['RS256']
    })

    return h.authenticated({
      credentials: {
        token: payload,
        sub: payload.sub,
        // Friendlier caller name than the role ARN, for logs and future per-caller rules.
        // Deliberately not called "scope": Hapi reserves credentials.scope for its own
        // route level scope checks and expects an array of strings there.
        serviceName: payload[STS_CLAIM]?.principal_tags?.ServiceName
      },
      artifacts: { protectedHeader, payload }
    })
  } catch (err) {
    if (isUpstreamFailure(err)) {
      request.logger.error(
        buildJwksUnavailableLog(request, err),
        'Could not verify JWT, the JSON Web Key Set was unavailable'
      )

      throw Boom.serverUnavailable('Unable to verify token')
    }

    request.logger.warn(
      buildTokenRejectedLog(request, err),
      'JWT verification failed'
    )

    throw Boom.unauthorized('Invalid token', 'Bearer')
  }
}

const createJwtScheme = (options) => {
  return () => {
    return {
      authenticate: (request, h) => {
        return authenticateToken(request, h, options)
      }
    }
  }
}

const buildLocalCredentials = (serviceName) => {
  const sub = buildCallerRoleArn(LOCAL_AWS_ACCOUNT, serviceName)

  return {
    token: {
      sub,
      [STS_CLAIM]: { principal_tags: { ServiceName: serviceName } }
    },
    sub,
    serviceName
  }
}

// Locally there's no AWS identity provider to issue callers a WebIdentity JWT, so requests are trusted unverified.
const createLocalScheme = (serviceName) => {
  return () => {
    return {
      authenticate: (_request, h) => {
        // Built per request so one request can't alter the credentials another sees
        return h.authenticated({ credentials: buildLocalCredentials(serviceName) })
      }
    }
  }
}

/**
 * Registers the JWT auth strategy used to protect service-to-service endpoints.
 *
 * Unless the bypass is enabled this plugin validates AWS WebIdentity JWTs issued to the
 * caller service. It checks the bearer token, verifies the signature against the remote
 * JWKS, and confirms the token issuer, audience, subject and algorithm match the expected
 * values for this service and the allowed upstream caller. A caller that fails any of
 * those checks gets a 401; a request that cannot be checked because the JWKS is
 * unavailable gets a 503, so an outage is not mistaken for a rejected caller.
 *
 * jose caches the JWKS and only refetches it when the cache ages out or a token arrives
 * signed with an unknown key, so its defaults are left in place: a 5 second fetch timeout,
 * a 30 second cooldown between refetches and a 10 minute cache lifetime.
 *
 * When auth.jwt.bypass (JWT_AUTH_BYPASS) is enabled for local development, where the CDP identity
 * provider is not available, this plugin swaps in a permissive scheme that authenticates requests
 * without JWT verification, as the allowed caller with synthetic token, sub and serviceName
 * credentials (sub uses the fake AWS account 000000000000). A warning is logged at registration
 * so it is obvious auth is disabled. The bypass is off by default and registration fails if it is
 * enabled when ENVIRONMENT is not local.
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

      const allowedCaller = config.get('auth.jwt.allowedCallerServiceName')

      if (bypass) {
        server.logger.warn(
          buildJwtBypassEnabledLog(),
          'JWT auth bypass is enabled, incoming requests are not verified'
        )
      } else {
        const issuer = config.get('auth.jwt.issuer')
        const jwksUri = config.get('auth.jwt.jwksUri')
        const awsAccount = config.get('auth.jwt.awsAccount')

        if (!issuer || !jwksUri || !awsAccount) {
          throw new Error(
            'JWT auth requires CDP_JWT_ISSUER, CDP_JWT_JWKS_URI and AWS_ACCOUNT unless the local bypass is enabled'
          )
        }

        server.app.JWKS = createRemoteJWKSet(new URL(jwksUri))
      }

      const scheme = bypass
        ? createLocalScheme(allowedCaller)
        : createJwtScheme({
          audience: config.get('auth.jwt.audience'),
          issuer: config.get('auth.jwt.issuer'),
          subject: buildCallerRoleArn(config.get('auth.jwt.awsAccount'), allowedCaller)
        })

      server.auth.scheme('jwt-proxy', scheme)
      server.auth.strategy('jwt', 'jwt-proxy')
      server.auth.default('jwt')
    }
  }
}
