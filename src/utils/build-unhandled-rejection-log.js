/**
 * Structured log context for an unhandled promise rejection, nested under the ECS `event`
 * and `error` namespaces.
 *
 * CDP formats logs with `@elastic/ecs-pino-format` and the OpenSearch ingestion pipeline
 * silently drops any flat top-level key, so fields have to be nested under an approved
 * namespace to be searchable. Passing the raw error to the logger instead produces flat
 * `err.*` keys, which are dropped along with the stack trace.
 */

const UNHANDLED_REJECTION_EVENT = 'unhandled_rejection'

const buildError = (reason) => {
  if (reason instanceof Error) {
    return {
      code: reason.code,
      message: reason.message,
      stack_trace: reason.stack,
      type: reason.name
    }
  }

  return {
    message: String(reason),
    type: typeof reason
  }
}

/**
 * Builds the log context for a promise rejection that nothing handled.
 *
 * A promise can reject with any value, not just an `Error`, so a non-error reason is
 * described by its string form and `typeof` and carries no stack trace.
 *
 * @param {unknown} reason - The value the promise rejected with
 * @returns {object} ECS log context
 */
export const buildUnhandledRejectionLog = (reason) => {
  return {
    event: {
      type: UNHANDLED_REJECTION_EVENT,
      outcome: 'failure'
    },
    error: buildError(reason)
  }
}
