---
name: testing
description: Testing standards and conventions for this project. Use when writing tests, reviewing test changes, or asked how to test the bank details API.
---

# Testing skill

## Framework

- Use `vitest`. Globals are off, so import `describe`, `test`, `expect`, `vi` and hooks from `vitest` in every test file.
- Test files are ESM and internal imports use `.js` extensions.
- Tests run serially (`fileParallelism: false`) and mocks are cleared between tests (`clearMocks: true`).

## Test layout

- Test files must match `test/**/*.test.js`.
- Unit tests live in `test/unit/` and mirror `src/` (`src/routes/health.js` -> `test/unit/routes/health.test.js`). They test one module in isolation, mocking its dependencies.
- Narrow integration tests live in `test/integration/narrow/` and also mirror `src/` (`src/routes/health.js` -> `test/integration/narrow/routes/health.test.js`). They start the real server with `createServer()` and call it with `server.inject()`, so routing, validation, auth and error handling are exercised together. Upstreams are still mocked. Stop the server in teardown.
- Every route has both: a unit test for the handler and a narrow integration test through `server.inject()`.
- Shared test helpers go in `test/helpers/` and shared fixtures in `test/mocks/`. Create these folders when the first file needs them.
- `test/setup.js` runs before every test file. Fetch is mocked globally there by `vitest-fetch-mock` (`fetchMock`). Never call real D365, CRM or AWS services.

## What to cover

- Every route: happy path, validation failure, auth failure.
- Every upstream client: success, 4xx, 5xx, timeout and malformed response.
- Config changes: valid and invalid values (convict validates strictly).
- Test names describe behaviour, e.g. `should return 404 when no bank details exist for the SBI`.

## Readability

- Do not use `test.each()`, `it.each()` or `describe.each()`. Write each case as its own
  `test()` with a name that states the behaviour in full.
- The reason is onboarding: a parameterised block asks the reader to resolve a case table
  against a templated name (`'should accept %s'`) before they can tell what any single case
  proves. An explicit test reads top to bottom, and a failure names the behaviour that broke
  rather than an index into a table.
- Accept the repetition. If expanding a block would duplicate a long assertion, that usually
  means the block was testing two things at once — split the shared assertion into its own
  test rather than repeating it in every case.
- Prefer a named helper over a loop if setup genuinely needs sharing, so the call site still
  reads as a sentence.

## Test data

- Use obviously fake values. No real SBIs, FRNs, account numbers, sort codes or names.
- Assert that bank details are never written to logs where logging is involved.

## Isolation

- Valid patterns: `vi.fn()`, `vi.spyOn()`, `vi.mock()`, `vi.doMock()` with `vi.resetModules()`.
- Restore anything you spy on or override (`vi.restoreAllMocks()`).
- Never commit `describe.only()`, `test.only()` or `it.only()`.

## Running tests

- Full suite with coverage: `npm test`.
- Watch mode: `npm run test:watch`.
- In a container (as CI will): `npm run docker:test`.
- Single file: `npx vitest run test/unit/routes/health.test.js` (set `TZ=UTC` as `npm test` does).
- Coverage must stay at or above 90% (SonarCloud quality gate).
