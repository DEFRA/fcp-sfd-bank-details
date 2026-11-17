import Boom from '@hapi/boom'
import Joi from 'joi'

export const INVALID_SORT_CODE = '99-AA-99'
export const INVALID_ACCOUNT_NUMBER = 'not-a-number'

export const bankDetailsSchema = Joi.object({
  sortCode: Joi.string().pattern(/^\d{2}-\d{2}-\d{2}$/),
  accountNumber: Joi.string().length(8)
})

export const invalidBankDetailsPayload = {
  sortCode: INVALID_SORT_CODE,
  accountNumber: INVALID_ACCOUNT_NUMBER
}

/**
 * Builds the error Hapi passes to a route's failAction when the payload fails Joi
 * validation: a boomified Joi ValidationError carrying the validation source.
 *
 * @param {object} [joiOptions] - Extra Joi validation options, e.g. `{ errors: { stack: true } }`
 * @returns {Error} The validation error
 */
export const buildPayloadValidationError = (joiOptions = {}) => {
  const { error } = bankDetailsSchema.validate(invalidBankDetailsPayload, {
    abortEarly: false,
    ...joiOptions
  })

  Boom.boomify(error, { statusCode: 400, override: false })
  error.output.payload.validation = {
    source: 'payload',
    keys: ['sortCode', 'accountNumber']
  }

  return error
}
