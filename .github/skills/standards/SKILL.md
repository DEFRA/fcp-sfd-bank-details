---
name: standards
description: Standard skills and patterns an agent should apply when working in this codebase
---

# Standards skill

## Context

This document defines the standards an agent must apply when reviewing or writing code in this project. Also read `.github/copilot-instructions.md`.

## Core principles

- Solve the problem as stated. Do not over-engineer, but do not build on stub or template code either: replace it.
- Follow existing patterns in the codebase before introducing new ones.
- Verify work before marking a task complete.
- Bank details are sensitive. Treat every change as one that handles financial PII.

## Reading code

- Read the full function and its callers before making changes.
- Check for existing helpers in `src/common/helpers/` before writing new ones.
- Search for all usages of a symbol before renaming or removing it.

## Writing code

- Match the style of the surrounding code: ESM, no semicolons, 2-space indent, single quotes.
- All internal `import` paths include the `.js` extension, and imports sit at the top of the file.
- Routes stay thin: validate input, call a service, shape the response.
- Business logic lives in services; calls to D365, CRM, AWS or other upstreams live in client modules, never in handlers.
- Map upstream response shapes to domain objects at the client boundary.
- All config goes through `src/config.js` (convict) and is documented in `env-vars.md`. Never read `process.env` elsewhere.
- Validate input with Joi; return errors with Boom without leaking internals.
- Log with the shared logger only. Never log bank details, other PII or full upstream payloads.
- External calls have timeouts and bounded retries.
- No inline comments unless the why is genuinely non-obvious.
- No error handling for scenarios that cannot happen, and no abstractions for a single use case.

## Testing

- Load `../testing/SKILL.md` when work or review includes tests.
- Use section 2 in [Standards review checklist](./review-checklist.md) for testing review criteria.

## Refactoring

- Refactor in a separate commit from behaviour changes.
- Do not rename or restructure things incidentally while fixing bugs.

## Reviewing code

See [Standards review checklist](./review-checklist.md).

## Quality gates

Before completing any task:

1. `npm run lint` and `npm run format:check` pass
2. `npm test` passes with coverage at or above 90%
3. No `console.*`, `.only`, or commented-out code
4. No new config without an `env-vars.md` entry
5. No unintended files changed

## References

See [External standards references](./external-references.md).
