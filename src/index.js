import process from 'node:process'

import { startServer } from './api/common/helpers/start-server.js'
import { handleUnhandledRejection } from './utils/handle-unhandled-rejection.js'

await startServer()

process.on('unhandledRejection', handleUnhandledRejection)
