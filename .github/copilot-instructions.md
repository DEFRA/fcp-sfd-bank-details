# Copilot instructions: fcp-sfd-bank-details

## What this is

Backend service for the Single Front Door (SFD) on Defra's Future Farming and Countryside Programme. It is a Hapi.js JSON API on Defra CDP with no UI, called service-to-service (primarily by `fcp-sfd-frontend`).

**Direction of travel:** this service is replacing the orchestration layer of the legacy "Bank Details Online" (ICE) service. It will integrate with **Dynamics 365 Finance (DAX)** and **Dynamics CRM (Dataverse)**, which remain the systems of record. This service does not store bank details itself. Expect it to:

- read supplier bank account information for a business from D365
- accept bank detail change requests, validate them, and write them to D365
- raise a case in CRM for caseworker review where required
- keep a like-for-like read API for legacy callers (e.g. the RPS portal) until they are retired

The repo started as the CDP Node.js backend template. Anything that looks like a stub or template leftover (hard-coded data, `/example` routes) is temporary: **replace it rather than build on it**. The code is changing quickly, so check the current source in `src/` rather than assuming this file lists every route or module. Background is in [docs/bank_details_service_replacement_overview.md](../docs/bank_details_service_replacement_overview.md).

## Stack

- Node **>= 24**, ESM (`"type": "module"`): use `import`/`export` and always include `.js` extensions.
- Hapi 21, convict (config), Joi (validation), `@hapi/boom` (errors).
- Logging via `hapi-pino` (ECS format); metrics, tracing and secure context via `@defra/*` CDP plugins.
- Tests: Vitest. Lint and code style: neostandard (ESLint).
- Outbound HTTP uses the CDP forward proxy via environment variables; do not add manual proxy agents.
- Local AWS emulation: floci (via compose).

## Commands

- `npm install`: install dependencies
- `npm run start:watch`: run on the host with nodemon on port 3010 (reads `.env`)
- `npm run docker:dev` / `npm run docker:debug`: run in Docker Compose with local AWS emulation (floci); debugger on host port 9233
- `npm run docker:test`: run lint and tests in a container
- `npm test` / `npm run test:watch`: Vitest with coverage / watch (`npm test` runs `lint` first)
- `npm run lint` / `npm run lint:fix`: check / fix lint and code style
- `npm run setup:husky`: enable the pre-commit hook (synthetic ID check, detect-secrets, `lint:fix`)
- Before pushing, run `npm run security-audit` and `npm test` (CI runs the same checks)

## Architecture

Keep dependencies flowing inward:

`routes → services → clients (D365, CRM, AWS, other upstreams)`

- `src/server.js` builds the Hapi server and registers plugins; `src/plugins/` holds one plugin per concern.
- `src/config.js` is the single source of config (convict, strict). Never read `process.env` elsewhere.
- `src/routes/` holds thin handlers: validate input, call a service, shape the response.
- Business logic belongs in `src/services/`; calls to D365, CRM or other upstreams belong in dedicated client modules with timeouts, retries and token handling. Never call upstreams from handlers.
- Keep D365/CRM response shapes at the client boundary. Map them to domain objects before they reach routes, so upstream changes don't leak into the API contract.
- Long-running or asynchronous work (such as change requests and case creation) should be decoupled via queues rather than done inline in a request.
- Shared helpers live in `src/common/helpers/`.

## Conventions

- No semicolons, 2-space indent, single quotes (enforced by neostandard). Run `npm run lint:fix` before committing.
- Don't extend or modify the neostandard ruleset (FCP standard): no `rules` overrides, `noStyle`, `noJsx` or `eslint-disable` comments. Fix the code instead.
- Validate all params, query and payload with Joi. Return errors with Boom, and never leak stack traces or upstream error bodies.
- Authenticate callers on every non-health route. Local auth bypass is for `ENVIRONMENT=local` only.
- Log with the shared logger, never `console`. **Never log bank details (account name, number, sort code) or other PII**, and don't log full upstream payloads.
- No real data, secrets or credentials in code, tests or fixtures; use obviously fake values.
- Use named constants rather than magic values; no commented-out code; JSDoc on exported functions.
- New config needs `doc`, `format`, `default` and `env` in `src/config.js`.
- Pin exact dependency versions and check `npm audit`. Don't introduce alternative frameworks (Express, Jest, dotenv).

## Testing

- Unit tests live in `test/unit/` and narrow integration tests in `test/integration/narrow/`; both mirror `src/`. Name tests by behaviour (`should return 404 when no bank details exist for the SBI`).
- Unit-test route handlers, and test routes end to end in `test/integration/narrow/` through `createServer()` and `server.inject()`; stop the server in teardown.
- Vitest globals are off: import `describe`, `test`, `expect` and `vi` from `vitest`.
- Cover the happy path, validation failure, auth failure and upstream failure (timeouts, 4xx/5xx) for every route.
- Mock outbound calls (`fetchMock` is set up in `test/setup.js`); never hit real D365 or CRM in tests.
- Coverage must stay **at or above 90%** (SonarCloud quality gate).
