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
- GitHub Actions CI

## Working rules
- Prioritize correctness, maintainability, and clear architecture over speed.
- Make small, reviewable changes.
- Do not introduce tools or dependencies unless they are necessary.
- Do not implement future milestones early.
- Keep the code production-oriented, not tutorial-style.

## Current milestone
Milestones 1, 2, 3, 3.5, 4A, 4B, 4C, and 4D are implemented.

The current frozen feature milestone is Milestone 4D: conservative semantic cache.
Milestone 3.5 is a documentation and CI quality milestone only.

Next planned work:
- final polish and project freeze

Allowed:
- repo scaffolding
- TypeScript gateway skeleton and authenticated chat-completions route
- Python eval worker skeleton
- health endpoint
- config loading
- structured logging
- minimal tests
- Docker Compose local setup
- GitHub Actions CI
- provider registry, config-driven routing, timeout budgets, retries, fallback, and local metrics
- Redis-backed governance: per-API-key rate limiting, daily token quota, monthly budget tracking, abuse protection, fail-closed governance behavior, and request-scoped governance idempotency
- process-local exact chat-completions cache with tenant isolation, canonical exact keys, fail-open behavior, and x-cache-status response headers
- persistent Postgres-backed exact cache storage with TTL enforcement and no raw API-key storage
- embedding provider boundary, deterministic mock embeddings, and stable chat-completion embedding input builder
- conservative semantic cache lookup after exact cache miss, with tenant/model compatibility, strict thresholding, fail-open behavior, and no live embedding provider

Not allowed yet:
- live embedding provider integration
- pgvector/vector-similarity runtime lookup
- Kafka runtime logic
- Kubernetes manifests
- eval-backed routing
- live external provider integration

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
