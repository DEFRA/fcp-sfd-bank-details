/**
 * Builds the IAM role ARN used as the caller subject for JWT authentication.
 *
 * @param {string} awsAccount - The AWS account ID that owns the role.
 * @param {string} serviceName - The name of the caller service role.
 * @returns {string} The caller's IAM role ARN.
 */
export const buildCallerRoleArn = (awsAccount, serviceName) => {
  return `arn:aws:iam::${awsAccount}:role/${serviceName}`
}
