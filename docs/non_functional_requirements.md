# Non-Functional Requirements

## Reliability

- Services must expose health endpoints or startup checks appropriate to their role.
- Failures should return structured error responses.

## Observability

- Application logs must be structured JSON.
- Log messages must avoid request payload contents and secrets.

## Security

- External input must be validated at API boundaries.
- Secrets must come from environment variables or secret stores, not source files.

## Maintainability

- Keep files focused and changes reviewable.
- Prefer clear interfaces over implicit cross-module coupling.
- Do not add future milestone behavior before it is needed.

## Testability

- Non-trivial behavior should have focused unit or integration coverage.
- Gateway checks must include lint, typecheck, and tests.
