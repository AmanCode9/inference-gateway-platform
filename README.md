# Inference Gateway Platform

Production-style scaffold for a distributed AI inference gateway. Milestone 1 keeps the system intentionally small: a TypeScript gateway skeleton, a Python eval worker skeleton, API/event contracts, documentation, and local infrastructure scaffolding.

## Repository Structure

- `services/gateway/` - TypeScript HTTP gateway.
- `workers/eval-worker/` - Python eval worker placeholder.
- `docs/` - product, architecture, and non-functional notes.
- `openapi/` - gateway API contracts.
- `asyncapi/` - event contracts for future usage events.
- `infra/` - local infrastructure notes and future IaC location.
- `dashboards/` - future Grafana dashboard assets.
- `tests/` - future cross-service test assets.

## Local Setup

Prerequisites:

- Node.js 20 or newer
- pnpm 10 or newer
- Python 3.11 or newer
- Docker Compose, optional for local dependencies

Install JavaScript dependencies:

```sh
pnpm install
```

Run the gateway locally:

```sh
pnpm --filter @igp/gateway dev
```

Run the Python worker placeholder:

```sh
python workers/eval-worker/app/main.py
```

Start local infrastructure placeholders:

```sh
docker compose up -d
```

## Checks

```sh
pnpm run lint
pnpm run typecheck
pnpm run test
```

The root `test` script runs gateway tests and the eval worker unit tests.

## Milestone 1 Boundaries

Included:

- Repository scaffold
- Gateway health endpoint
- Versioned `/v1/chat/completions` placeholder
- Environment-based config loading
- Structured JSON logging
- Minimal gateway unit and integration tests
- Python eval worker placeholder and tests
- Docker Compose local dependency scaffold

Not included yet:

- Semantic caching
- Redis rate limiting logic
- Kafka event pipeline or runtime producer/consumer logic
- Kubernetes manifests
- Eval-backed routing
- Multi-provider production routing
