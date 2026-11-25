/**
 * Local-only auth for development without an AWS identity provider.
 * Requests are authenticated as the allowed caller with synthetic credentials
 * in the same shape as verified JWT credentials. The account ID is deliberately fake.
 */
import { config } from '../config/index.js'
import { STS_CLAIM } from '../config/constants/auth.js'
import { buildCallerRoleArn } from '../utils/build-caller-role-arn.js'
import { buildJwtBypassEnabledLog } from '../utils/build-jwt-auth-log.js'

const LOCAL_AWS_ACCOUNT = '000000000000'

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

const createLocalScheme = (serviceName) => {
  return () => {
    return {
      authenticate: (_request, h) => {
        return h.authenticated({ credentials: buildLocalCredentials(serviceName) })
      }
    }
  }
}

/**
 * Registers the local-only auth strategy with synthetic caller credentials.
 */
export const localAuth = {
  plugin: {
    name: 'local-auth',
    register: async (server) => {
      if (config.get('cdpEnvironment') !== 'local') {
        throw new Error(
          'JWT auth bypass is only permitted when ENVIRONMENT is local'
        )
      }

      const allowedCaller = config.get('auth.jwt.allowedCallerServiceName')

      server.logger.warn(
        buildJwtBypassEnabledLog(),
        'JWT auth bypass is enabled, incoming requests are not verified'
      )

      server.auth.scheme('jwt-proxy', createLocalScheme(allowedCaller))
      server.auth.strategy('jwt', 'jwt-proxy')
      server.auth.default('jwt')
    }
  }
}
