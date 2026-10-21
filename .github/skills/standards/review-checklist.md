# Standards review checklist

Use this checklist when reviewing changed code. Apply findings only to changed files.

## 1. Correctness and behaviour

- The code does what the change says it does.
- Edge cases are handled (null, empty, boundary values, malformed upstream responses).
- Error paths return useful messages without leaking internals or upstream error bodies.

## 2. Tests and coverage

See `../testing/SKILL.md` for testing patterns and conventions.

- New code has unit tests covering the happy path and key error paths.
- Routes have tests for validation failure and auth failure; clients have tests for 4xx, 5xx and timeouts.
- Test names describe the behaviour being verified.
- Test data is obviously fake; no real SBIs, FRNs or bank details.
- Coverage does not decrease; target is 90% minimum (SonarCloud quality gate).
- `npm test` is safe to run on the host if runtime verification is needed.

## 3. Security

- No secrets, API keys, tokens or credentials are committed.
- All input (params, query, payload, headers) is validated with Joi.
- Every non-health route authenticates the caller. `JWT_AUTH_BYPASS` is only ever usable when `ENVIRONMENT=local`.
- Logging does not contain PII (names, addresses, emails, NI numbers, bank details) or full upstream payloads.
- Error responses do not expose stack traces, D365/CRM internals or other upstream detail.
- New dependencies are maintained, pinned to exact versions and pass `npm audit`.
- SonarCloud security hotspots are reviewed and resolved; no new vulnerabilities or code smells (SonarWay profile).

## 4. Performance and reliability

- No blocking operations on the event loop.
- External calls (D365, CRM, AWS) have timeouts and bounded retry logic, and failures are handled.
- Retried writes are idempotent, so a retry cannot create a duplicate bank account change or CRM case.
- Long-running work is not done inline in a request handler.

## 5. Maintainability and readability

Apply the Writing code and Refactoring sections in [SKILL.md](./SKILL.md).

- No commented-out code.
- Functions and variables have descriptive names.
- Complex logic has explanatory comments or is split into named functions.
- No magic numbers or strings; use named constants.

## 6. Architecture and boundaries

- Code follows the existing project structure.
- Dependencies flow inward (routes -> services -> clients).
- Handlers do not call upstreams directly; upstream response shapes are mapped at the client boundary.
- No circular dependencies between modules.
- Config is read only via `src/config.js`.

## 7. Documentation

- Exported functions have JSDoc comments.
- README is updated if setup steps or prerequisites change.
- Breaking changes to the API contract are clearly documented.

## 8. AI customization files

- Applies when the change touches `.github/copilot-instructions.md` or `.github/skills/**/SKILL.md`, or changes code that they describe.
- Every rule is verifiable in the code today. Open the file it cites and confirm the path, symbol or script exists.
- No rule contradicts another instruction file or `copilot-instructions.md`.
