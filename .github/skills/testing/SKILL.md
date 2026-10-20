---
name: testing
description: Testing standards and conventions for this project. Use when writing tests, reviewing test changes, or asked how to test the bank details API.
---

# Testing skill

## Framework

- Use `vitest` (`globals: true`, so `describe`, `test`, `expect` and `vi` are available without import).
- Test files are ESM and internal imports use `.js` extensions.
- Tests run serially (`fileParallelism: false`) and mocks are cleared between tests (`clearMocks: true`).

## Test layout

- Test files must match `test/**/*.test.js`.
- Unit tests live in `test/unit/` and mirror `src/` (`src/routes/health.js` -> `test/unit/routes/health.test.js`).
- Route tests go through `createServer()` and `server.inject()` so validation, auth and error handling are exercised. Stop the server in teardown.
- Fetch is mocked globally by `vitest-fetch-mock` in `.vite/setup-files.js` (`fetchMock`). Never call real D365, CRM or AWS services.

## What to cover

- Every route: happy path, validation failure, auth failure.
- Every upstream client: success, 4xx, 5xx, timeout and malformed response.
- Config changes: valid and invalid values (convict validates strictly).
- Test names describe behaviour, e.g. `should return 404 when no bank details exist for the SBI`.

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
- Single file: `npx vitest run test/unit/routes/health.test.js` (set `TZ=UTC` as `npm test` does).
- Coverage must stay at or above 90% (SonarCloud quality gate).
