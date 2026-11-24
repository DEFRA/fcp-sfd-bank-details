# fcp-sfd-bank-details

Core delivery platform Node.js Backend Template.

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Local development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Testing](#testing)
  - [Production](#production)
  - [Npm scripts](#npm-scripts)
  - [Update dependencies](#update-dependencies)
  - [Formatting](#formatting)
    - [Line endings on Windows](#line-endings-on-windows)
- [API endpoints](#api-endpoints)
- [Service to service authentication](#service-to-service-authentication)
  - [Environment variables](#environment-variables)
- [Development helpers](#development-helpers)
  - [Proxy](#proxy)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Docker Compose](#docker-compose)
    - [Running with fcp-sfd-frontend](#running-with-fcp-sfd-frontend)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [Continuous integration](#continuous-integration)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Requirements

### Node.js

Please install [Node.js](http://nodejs.org/) `>= v24` and [npm](https://nodejs.org/) `>= v11`. You will find it
easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd fcp-sfd-bank-details
nvm use
```

## Local development

### Setup

Install application dependencies:

```bash
npm install
```

### Git hooks

Install git hooks (optional)

```bash
npm run git:hooks
```

### Development

To run the application on your machine in `development` mode, on `http://localhost:3010`, with nodemon restarting it when files in `src/` change:

```bash
npm run start:watch
```

Use `npm run start:debug` to pause on startup until a debugger attaches (port 9229).

The `start:watch` and `start:debug` scripts set `JWT_AUTH_BYPASS=true`, which skips JWT verification because the CDP identity provider is not available locally. The bypass is disabled by default and the service refuses to start with it enabled unless `ENVIRONMENT` is `local`.

With the bypass on, every request is authenticated as `BANK_DETAILS_ALLOWED_CALLER` (default `fcp-sfd-frontend`). `request.auth.credentials` has the same shape as a verified token (`token`, `sub` and `serviceName`), with `sub` set to `arn:aws:iam::000000000000:role/<BANK_DETAILS_ALLOWED_CALLER>`. The fake account id means it can't be mistaken for a real identity. A `JWT auth bypass is enabled` warning is logged at startup.

### Testing

To lint and test the application with coverage run:

```bash
npm test
```

Use `npm run test:watch` for watch mode, or `npm run docker:test` to run the tests in a container.

Tests are split into `test/unit/` (single modules, dependencies mocked) and `test/integration/narrow/` (the real server called through `server.inject()`, upstreams mocked). Both mirror `src/`. `test/setup.js` runs before each test file and mocks `fetch` globally.

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

Without the CDP JWT settings (`CDP_JWT_ISSUER`, `CDP_JWT_JWKS_URI`, `AWS_ACCOUNT`) this fails to start locally. Either provide them, or opt in explicitly with `JWT_AUTH_BYPASS=true npm start` (local only).

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json).
To view them in your command line run:

```bash
npm run
```

### Update dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

### Formatting

[neostandard](https://github.com/neostandard/neostandard) (ESLint) handles both linting and code style. Run `npm run lint` to check and `npm run lint:fix` to fix. `npm test` runs `lint` first.

#### Line endings on Windows

If you are having issues with line endings on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

## API endpoints

| Endpoint                   | Description                                                  |
| :------------------------- | :----------------------------------------------------------- |
| `GET: /health`             | Health (no authentication)                                   |
| `GET: /bank-details/{sbi}` | Bank details for a business (stub data; JWT authentication) |

## Service to service authentication

This service is called service to service, primarily by `fcp-sfd-frontend`. Every route
except `/health` requires an AWS WebIdentity JWT in an `Authorization: Bearer <token>`
header. `/health` is left open because the CDP platform health checks rely on it.

`src/plugins/jwt-auth.js` registers the `jwt` strategy and sets it as the server default,
so a new route is protected unless it explicitly opts out. For each request it:

- verifies the token signature against the JSON Web Key Set published by the CDP identity
  provider
- checks the `iss`, `aud` and `sub` claims, and pins the algorithm to `RS256`
- rejects anything that fails those checks with `401`, and returns `503` if the key set
  itself could not be fetched, so an outage is not reported as a bad caller

Checking the signature, issuer and audience alone only proves the token came from the
platform. The `sub` check is what proves the caller is the frontend: `sub` is the IAM role
ARN of the calling service, so it is compared against
`arn:aws:iam::<AWS_ACCOUNT>:role/<BANK_DETAILS_ALLOWED_CALLER>`.

The key set is hosted outside the CDP network, so the request to `CDP_JWT_JWKS_URI` has to
go through the forward proxy. `jose` fetches it with the global `fetch`, which Node routes
through the proxy using the environment variables described under
[Proxy](#proxy) — no proxy wiring is needed in this service. Overriding `jose` with an HTTP
client that has no proxy dispatcher would stop token verification working once deployed.

### Environment variables

| Variable                      | Description                                                                |
| :---------------------------- | :------------------------------------------------------------------------- |
| `CDP_JWT_ISSUER`              | Expected `iss` claim. Injected by the platform.                            |
| `CDP_JWT_JWKS_URI`            | Where the signing keys are published. Injected by the platform.            |
| `AWS_ACCOUNT`                 | AWS account id used to build the expected `sub`. Injected by the platform. |
| `CDP_JWT_AUDIENCE`            | Expected `aud` claim. Defaults to `fcp-sfd-bank-details`.                  |
| `BANK_DETAILS_ALLOWED_CALLER` | Service name permitted to call this API. Defaults to `fcp-sfd-frontend`.   |
| `JWT_AUTH_BYPASS`             | Local development only. See [Development](#development).                   |

The service refuses to start if `CDP_JWT_ISSUER`, `CDP_JWT_JWKS_URI` or `AWS_ACCOUNT` are
missing and the bypass is off, rather than starting up unprotected.

## Development helpers

### Proxy

We are using forward-proxy which is set up by default. Services are automatically configured with the proxy environment variables when deployed.

Node.js 24 uses these variables to route outbound HTTP(S) requests through the proxy:

NODE_USE_ENV_PROXY=1
HTTPS_PROXY=...
NO_PROXY=...

No additional proxy configuration is required in the service.

## Docker

Build:

```bash
docker build --no-cache --tag fcp-sfd-bank-details .
```

Run:

```bash
docker run -e PORT=3010 -p 3010:3010 fcp-sfd-bank-details
```

### Docker Compose

A local environment with:

- This service, available at `http://localhost:3010`, with the Node debugger on port `9233`.
- [floci](https://floci.io) for local AWS emulation, available at `http://localhost:4566`.

| File | Purpose |
| :--- | :------ |
| `compose.yaml` | Services, images and environment variables |
| `compose.override.yaml` | Local ports, source mounts and the shared `fcp-sfd` network (applied automatically by `docker compose up`) |
| `compose.debug.yaml` | Starts the service with `npm run start:debug` |
| `compose.test.yaml` | Runs `npm test` (lint, then tests with coverage) in a container |
| `compose.test.watch.yaml` | Runs `npm run test:watch` in a container |

| Script | Description |
| :----- | :---------- |
| `npm run docker:build` | Build the images |
| `npm run docker:dev` / `docker:dev:d` | Start the environment (attached / detached) |
| `npm run docker:debug` | Start the environment, paused until a debugger attaches on port `9233` |
| `npm run docker:stop` / `docker:stop:v` | Stop the environment (and remove volumes) |
| `npm run docker:test` | Run lint and tests in a container; coverage is written to `coverage/` |
| `npm run docker:test:watch` | Run tests in watch mode in a container |

The service runs with nodemon, so changes in `src/` restart it. Compose sets `ENVIRONMENT=local` and `JWT_AUTH_BYPASS=true`, so protected endpoints can be called without a JWT locally.

Compose reads a root `.env` file only to fill in `${VAR}` values in the Compose files; it is not passed into the container. If the service needs a value from `.env`, add it to the service's `environment` in `compose.yaml` as `VAR: ${VAR}`.

Check the endpoints:

```bash
curl -i http://localhost:3010/health
curl -i http://localhost:3010/bank-details/800000001
```

The health endpoint returns `200` with `{"message":"success"}`. The
bank-details endpoint currently returns stub data, not data from an upstream system.

The service does not currently use AWS resources. The `floci-init` container runs [floci/init.sh](floci/init.sh) once floci is ready; add the S3 buckets, SQS queues and SNS topics there when an integration needs them.

#### Running with fcp-sfd-frontend

[fcp-sfd-frontend](https://github.com/DEFRA/fcp-sfd-frontend) is the only service currently allowed to call this API. In a deployed environment it sends an AWS WebIdentity JWT that this service verifies. Locally neither side can do that, because floci can't issue WebIdentity tokens, so both services skip it:

- The frontend sees `ENVIRONMENT=local` (its default), skips the AWS STS call and sends no `Authorization` header.
- This service runs with `JWT_AUTH_BYPASS=true` and authenticates the request as the allowed caller (see [Development](#development)).

Neither service calls AWS STS or the JWKS endpoint.

To run them together:

> We recommend running both services as Docker containers with `npm run docker:dev`. Compose sets the local environment variables for you (`ENVIRONMENT=local` and `JWT_AUTH_BYPASS=true` here) and puts both services on the shared `fcp-sfd` network, which is closer to how they run when deployed. Running on the host with `npm run start:watch` also works, but you then manage those settings yourself.

1. Start this service with `npm run docker:dev`. It listens on `http://localhost:3010`.
2. Start `fcp-sfd-frontend`, either from its repo with `npm run docker:dev` or through [fcp-sfd-dev-environment](https://github.com/DEFRA/fcp-sfd-dev-environment). Its `BANK_DETAILS_ENDPOINT` defaults to `http://host.docker.internal:3010`, which reaches this service through the host port.
3. Check the connection through the frontend's diagnostic routes. Neither needs a sign-in:

   ```bash
   curl -i http://localhost:3000/bank-details-check
   curl -i http://localhost:3000/bank-details-check/800000001
   ```

   The first returns `{"message":"success"}`. The second returns the stub bank details for the SBI. These are made-up bank details hard-coded in this service, not real data from an upstream system.

If either check returns `{"message":"failure"}` (the SBI route also returns `502`), make sure this service is running on port `3010`. Then check that the frontend's `.env` doesn't override `BANK_DETAILS_ENDPOINT` with an old port. A `401` in this service's logs means the bypass is off: confirm `JWT_AUTH_BYPASS=true` and `ENVIRONMENT=local`.

### Dependabot

Dependabot is configured in [.github/dependabot.yml](.github/dependabot.yml) for security updates only
(npm, Docker, Docker Compose and GitHub Actions), checked weekly on Mondays. Version-update PRs are disabled
via `open-pull-requests-limit: 0`; security updates are grouped into one PR per ecosystem.

Dependabot security updates must also be enabled in the repository's GitHub settings
(Settings > Advanced Security).

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties)

## Continuous integration

[check-pull-request.yml](.github/workflows/check-pull-request.yml) runs on pull requests to `main` (and can be run manually). It:

1. Checks for real-looking CRNs and SBIs, and scans all tracked files for secrets.
2. Runs `npm run security-audit` and `npm run lint` on the runner.
3. Builds the production Docker image.
4. Runs the tests in a container with `npm run docker:test`, the same command as locally, and fails if `coverage/lcov.info` isn't generated.
5. Runs a SonarCloud scan (skipped for Dependabot).
6. Runs GitHub's dependency review, which fails on new dependencies with high or critical vulnerabilities.

[pr-approval-bot.yml](.github/workflows/pr-approval-bot.yml) comments on approved pull requests to remind you to add `#patch` or `#major` to the merge commit when needed. [publish.yml](.github/workflows/publish.yml) builds and publishes the service to CDP on merge to `main`; [publish-hotfix.yml](.github/workflows/publish-hotfix.yml) does the same for hot fixes.

All actions are pinned to a full commit SHA, with the version in a trailing comment. When updating an action, update the SHA and the comment together.

## Pre-commit hook

A [Husky](https://typicode.github.io/husky/) pre-commit hook runs:

- [`sfd-id-check`](https://github.com/DEFRA/fcp-sfd-core/tree/main/scripts/check-synthetic-ids): blocks commits that add real-looking CRNs or SBIs. Pull requests run the same check.
- [`detect-secrets`](https://github.com/Yelp/detect-secrets): scans staged files for secrets against [`.secrets.baseline`](.secrets.baseline). If it isn't installed, the hook warns and skips it. Install it with `pip3 install detect-secrets`. Pull requests scan all tracked files.
- `npm run lint:fix`: runs ESLint with neostandard and `--fix`.

Commit from the command line to see the full hook output.

Enable the hook once per clone:

```bash
npm install
npm run setup:husky
```

Use synthetic identifiers only: CRNs from `9000000000` to `9999999999` and SBIs from `800000000` to `899999999`. If a flagged number isn't a CRN or SBI, such as a timestamp, add `sfd-id-check: allow` in a comment on the same line, or list it in `.sfd-id-check-allow`. See the [`sfd-id-check` README](https://github.com/DEFRA/fcp-sfd-core/tree/main/scripts/check-synthetic-ids) for details.

If detect-secrets flags a value that isn't a secret, such as a fake local credential, update the baseline and mark the finding as a false positive:

```bash
detect-secrets scan --baseline .secrets.baseline
detect-secrets audit .secrets.baseline
```

Commit the updated `.secrets.baseline`. Never add real secrets to the baseline; remove them and rotate them instead.

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
