import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'

import { serverConfig } from './server.js'
import { authConfig } from './auth.js'
import { loggingConfig } from './logging.js'
import { proxyConfig } from './proxy.js'
import { tracingConfig } from './tracing.js'

convict.addFormats(convictFormatWithValidator)

export const config = convict({
  ...serverConfig,
  ...authConfig,
  ...loggingConfig,
  ...proxyConfig,
  ...tracingConfig
})

config.validate({ allowed: 'strict' })
