import { createLogger } from '../../../logging/logger.js'
import {
  buildValidationFailureLog,
  VALIDATION_FAILED_MESSAGE
} from '../../../utils/build-validation-failure-log.js'

const logger = createLogger()

/**
 * Hapi failAction for request validation, shared by every route. Logs the failure and
 * rethrows the error unchanged so Hapi returns its usual 400 response.
 *
 * @param {object} request - Hapi request object
 * @param {object} _h - Hapi response toolkit
 * @param {Error} error - The validation error
 */
export const failAction = (request, _h, error) => {
  logger.warn(buildValidationFailureLog(request, error), VALIDATION_FAILED_MESSAGE)
  throw error
}
