import process from 'node:process'

import { createLogger } from '../logging/logger.js'
import { buildUnhandledRejectionLog } from './build-unhandled-rejection-log.js'

/**
 * Logs a promise rejection that nothing handled and marks the process to exit with a
 * failure code.
 *
 * @param {unknown} reason - The value the promise rejected with
 */
export const handleUnhandledRejection = (reason) => {
  const logger = createLogger()

  logger.error(buildUnhandledRejectionLog(reason), 'Unhandled rejection')
  process.exitCode = 1
}
