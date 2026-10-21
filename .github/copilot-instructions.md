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
- Tests: Vitest. Lint: neostandard (ESLint). Format: Prettier.
- Outbound HTTP uses the CDP forward proxy via environment variables; do not add manual proxy agents.
- Local AWS emulation: floci (via compose), alongside Redis.

## Commands

- `npm install`: install dependencies
- `npm run dev`: run with watch on port 3001 (reads `.env`)
- `docker compose up --build`: run with local AWS emulation and Redis
- `npm test` / `npm run test:watch`: Vitest with coverage / watch
- `npm run lint:fix` and `npm run format`: fix lint and formatting
- `npm run git:pre-commit-hook`: audit, format check, lint and test; run before pushing

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

- No semicolons, 2-space indent, single quotes. Run lint and format before committing.
- Validate all params, query and payload with Joi. Return errors with Boom, and never leak stack traces or upstream error bodies.
- Authenticate callers on every non-health route. Local auth bypass is for `ENVIRONMENT=local` only.
- Log with the shared logger, never `console`. **Never log bank details (account name, number, sort code) or other PII**, and don't log full upstream payloads.
- No real data, secrets or credentials in code, tests or fixtures; use obviously fake values.
- Use named constants rather than magic values; no commented-out code; JSDoc on exported functions.
- New config needs `doc`, `format`, `default` and `env` in `src/config.js`.
- Pin exact dependency versions and check `npm audit`. Don't introduce alternative frameworks (Express, Jest, dotenv).

## Testing

- Tests live in `test/unit/`, mirroring `src/`. Name tests by behaviour (`should return 404 when no bank details exist for the SBI`).
- Test routes through `createServer()` and `server.inject()`; stop the server in teardown.
- Cover the happy path, validation failure, auth failure and upstream failure (timeouts, 4xx/5xx) for every route.
- Mock outbound calls (`fetchMock` is set up in `.vite/setup-files.js`); never hit real D365 or CRM in tests.
- Coverage must stay **at or above 90%** (SonarCloud quality gate).
