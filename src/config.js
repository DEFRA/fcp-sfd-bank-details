import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'

convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

export const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind',
    format: 'port',
    default: 3001,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'fcp-sfd-bank-details'
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: [
      'local',
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test',
      'prod'
    ],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  auth: {
    jwt: {
      audience: {
        doc: 'The audience name this service expects in incoming service-to-service JWTs',
        format: String,
        default: 'fcp-sfd-bank-details',
        env: 'CDP_JWT_AUDIENCE'
      },
      issuer: {
        doc: 'Issuer used to validate incoming service-to-service JWTs',
        format: String,
        nullable: true,
        default: null,
        env: 'CDP_JWT_ISSUER'
      },
      jwksUri: {
        doc: 'External URI providing the public keys used to verify incoming service-to-service JWTs',
        format: String,
        nullable: true,
        default: null,
        env: 'CDP_JWT_JWKS_URI'
      },
      awsAccount: {
        doc: 'AWS account ID for the current CDP environment, used to validate the subject (calling service) of incoming JWTs',
        format: String,
        nullable: true,
        default: null,
        env: 'AWS_ACCOUNT'
      },
      bypass: {
        doc: 'Skip JWT verification. Only permitted when ENVIRONMENT is local',
        format: Boolean,
        default: false,
        env: 'JWT_AUTH_BYPASS'
      },
      allowedCallerServiceName: {
        doc: 'The only CDP service name allowed to call the protected endpoints on this service',
        format: String,
        default: 'fcp-sfd-frontend',
        env: 'BANK_DETAILS_ALLOWED_CALLER'
      }
    }
  },
  log: {
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy URL',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  }
})

config.validate({ allowed: 'strict' })
