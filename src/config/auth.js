export const authConfig = {
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
  }
}
