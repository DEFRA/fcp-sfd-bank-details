/**
 * Structured log context for JWT authentication, nested under the ECS `event` and `error`
 * namespaces.
 *
 * CDP formats logs with `@elastic/ecs-pino-format` and the OpenSearch ingestion pipeline
 * silently drops any flat top-level key, so fields have to be nested under an approved
 * namespace to be searchable.
 */

const JWT_VERIFICATION_EVENT = 'jwt_verification'

const buildEvent = (request) => ({
  type: JWT_VERIFICATION_EVENT,
  action: request.method,
  category: request.path,
  outcome: 'failure'
})

/**
 * Builds the log context for a token this service rejected.
 *
 * No stack trace is included. The caller is at fault rather than this service, the stack is
 * the same code path every time, and omitting it keeps log volume down if a bad caller
 * retries in a loop.
 *
 * @param {object} request - Hapi request object
 * @param {Error} err - The error thrown by jwtVerify
 * @returns {object} ECS log context
 */
export const buildTokenRejectedLog = (request, err) => ({
  event: buildEvent(request),
  error: {
    code: err.code,
    message: err.message,
    type: err.constructor.name
  }
})

/**
 * Builds the log context for a request that could not be verified because the JSON Web Key
 * Set could not be fetched or trusted.
 *
 * This one does carry a stack trace, because it points at our infrastructure rather than
 * the caller and is worth diagnosing.
 *
 * @param {object} request - Hapi request object
 * @param {Error} err - The error thrown while resolving the JWKS
 * @returns {object} ECS log context
 */
export const buildJwksUnavailableLog = (request, err) => ({
  event: buildEvent(request),
  error: {
    code: err.code,
    message: err.message,
    stack_trace: err.stack,
    type: err.constructor.name
  }
})
