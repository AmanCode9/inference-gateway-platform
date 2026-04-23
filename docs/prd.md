# Product Requirements

## Overview

The inference gateway will provide a stable API layer for AI inference requests, routing, observability, and evaluation workflows. Milestone 1 establishes the repository foundation and basic service skeletons only.

## Users

- Application teams that need a single inference API surface.
- Platform engineers responsible for operating the gateway.
- Evaluation workers that will later score or inspect model behavior.

## Milestone 1 Scope

- Repository structure for gateway, worker, contracts, docs, infrastructure, tests, and dashboards.
- TypeScript gateway with a health endpoint and placeholder chat completions route.
- Python eval worker placeholder entrypoint.
- Environment configuration and structured logs.
- Minimal automated tests.
- Docker Compose local dependency scaffold.

## Out of Scope

- Semantic cache behavior.
- Redis rate limiting.
- Kafka event publishing or consumption.
- Eval-backed routing.
- Multi-provider routing.
- Kubernetes manifests.

## Acceptance Criteria

- The gateway returns `200` from `GET /health`.
- `POST /v1/chat/completions` validates basic request shape and returns a clear not-implemented response.
- Gateway lint, typecheck, and tests run through pnpm scripts.
- Eval worker tests run with Python unittest.
