# AGENTS.md

## Project
This repository is a production-style distributed AI inference gateway.

Current stack:
- TypeScript gateway
- Python eval worker
- Redis
- Postgres + pgvector
- Kafka
- OpenTelemetry
- Grafana
- Docker
- Kubernetes later
- GitHub Actions later

## Working rules
- Prioritize correctness, maintainability, and clear architecture over speed.
- Make small, reviewable changes.
- Do not introduce tools or dependencies unless they are necessary.
- Do not implement future milestones early.
- Keep the code production-oriented, not tutorial-style.

## Current milestone
Milestone 1 only.

Allowed:
- repo scaffolding
- TypeScript gateway skeleton
- Python eval worker skeleton
- health endpoint
- placeholder chat completions route
- config loading
- structured logging
- minimal tests
- Docker Compose local setup

Not allowed yet:
- semantic caching
- Redis rate limiting logic
- Kafka event pipeline
- Kubernetes manifests
- eval-backed routing
- multi-provider production routing

## Code standards
- Use strict TypeScript.
- Avoid `any` unless absolutely necessary and justify it.
- Validate all external input.
- Use clear interfaces and modular structure.
- Keep functions and files focused.

## Testing rules
For every non-trivial change:
1. add or update tests
2. run lint
3. run typecheck
4. run tests
5. summarize what changed and any remaining risks

## Documentation rules
- Update README if setup or behavior changes.
- Keep API contracts in `openapi/`.
- Keep event contracts in `asyncapi/`.
- Put design notes in `docs/`.

## Task behavior
Before editing:
- read the relevant files first
- explain the intended change briefly

After editing:
- summarize files changed
- list commands run
- report risks, TODOs, or follow-ups