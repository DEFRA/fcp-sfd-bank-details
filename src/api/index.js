import Hapi from '@hapi/hapi'
import { secureContext } from '@defra/hapi-secure-context'
import { config } from '../config/index.js'
import { router } from './router.js'
import { requestLogger } from './common/helpers/request-logger.js'
import { failAction } from './common/helpers/fail-action.js'
import { pulse } from './common/helpers/pulse.js'
import { requestTracing } from './common/helpers/request-tracing.js'
import { jwtAuth } from '../plugins/jwt-auth.js'
import { metrics } from '@defra/cdp-metrics'

export const createServer = async () => {
  const server = Hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        },
        failAction
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  // Hapi Plugins:
  // requestLogger  - automatically logs incoming requests
  // requestTracing - trace header logging and propagation
  // secureContext  - loads CA certificates from environment config
  // pulse          - provides shutdown handlers
  // jwtAuth        - verifies calling services via AWS WebIdentity JWTs (bypassed locally, see plugin)
  // router         - routes used in the app
  await server.register([
    requestLogger,
    requestTracing,
    metrics,
    secureContext,
    pulse,
    jwtAuth,
    router
  ])

  return server
}
