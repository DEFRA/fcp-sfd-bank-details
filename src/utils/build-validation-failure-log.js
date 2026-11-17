/**
 * Structured log context for a request that failed Joi validation, nested under the ECS
 * `event` and `error` namespaces.
 *
 * CDP formats logs with `@elastic/ecs-pino-format` and the OpenSearch ingestion pipeline
 * silently drops any flat top-level key, so fields have to be nested under an approved
 * namespace to be searchable.
 *
 * Joi's own message is never logged. Its messages embed the submitted value (for example
 * `"sortCode" with value "..." fails to match the required pattern`), and every route shares
 * this handler, so logging it would write bank details to the logs. Only field paths and Joi
 * rule types are recorded.
 */

const REQUEST_VALIDATION_EVENT = 'request_validation'
const MAX_REPORTED_FIELDS = 10
const STACK_FRAME_PREFIX = 'at '

export const VALIDATION_FAILED_MESSAGE = 'Request validation failed'

const describeFields = (details = []) => {
  const fields = details
    .slice(0, MAX_REPORTED_FIELDS)
    .map(({ path, type }) => `${path.join('.')} (${type})`)

  const unreported = details.length - fields.length

  if (unreported > 0) {
    fields.push(`and ${unreported} more`)
  }

  return fields.join(', ')
}

const buildReason = (err) => {
  const source = err.output?.payload?.validation?.source
  const fields = describeFields(err.details)

  return [source, fields].filter(Boolean).join(': ') || undefined
}

// The first line of a V8 stack repeats the message, which can carry submitted values, so
// only the frames are kept. If the stack doesn't start with the expected header (the message
// was changed after the stack was formatted) nothing is returned rather than risk a leak.
const extractStackFrames = (err) => {
  const header = `${err.name}: ${err.message}`

  if (!err.stack?.startsWith(header)) {
    return undefined
  }

  const frames = err.stack
    .slice(header.length)
    .split('\n')
    .filter((line) => line.trimStart().startsWith(STACK_FRAME_PREFIX))

  return frames.length > 0 ? frames.join('\n') : undefined
}

/**
 * Builds the log context for a request that failed validation.
 *
 * Joi builds its errors without stack frames, so `error.stack_trace` is only present when
 * the error has frames to report, such as one thrown by a custom validate function. Like a
 * rejected token, a validation failure is the caller's fault rather than this service's.
 *
 * @param {object} request - Hapi request object
 * @param {Error} err - The validation error Hapi passes to failAction
 * @returns {object} ECS log context
 */
export const buildValidationFailureLog = (request, err) => {
  const { method, path } = request

  return {
    event: {
      type: REQUEST_VALIDATION_EVENT,
      action: method,
      category: path,
      outcome: 'failure',
      reason: buildReason(err)
    },
    error: {
      code: err.output?.statusCode ?? err.code,
      message: VALIDATION_FAILED_MESSAGE,
      stack_trace: extractStackFrames(err),
      type: err.name
    }
  }
}
