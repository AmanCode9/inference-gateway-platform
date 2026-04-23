# Inference Gateway Platform

Production-style scaffold for a distributed AI inference gateway. Milestone 1 keeps the system intentionally small: a TypeScript gateway, a Python eval worker skeleton, API and event contracts, documentation, and local infrastructure scaffolding.

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
- Python 3.12
- Docker Compose, optional for local dependencies

Install JavaScript dependencies:

```sh
pnpm install
```

Run the gateway locally:

```sh
$env:GATEWAY_API_KEY="local-dev-gateway-key"
$env:PROVIDER_KIND="mock"
pnpm --filter @igp/gateway dev
```

The gateway exposes:

- `GET /health`
- `POST /v1/chat/completions`

The chat completions route expects:

- `x-api-key` header matching `GATEWAY_API_KEY`
- `Content-Type: application/json`
- a normalized payload with `model` and `messages`

Example request:

```sh
curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "x-api-key: local-dev-gateway-key" ^
  -d "{\"model\":\"mock-model\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}"
```

To exercise the real-provider adapter stub instead of the mock adapter:

```sh
$env:PROVIDER_KIND="real_stub"
$env:REAL_PROVIDER_NAME="openai"
$env:REAL_PROVIDER_BASE_URL="https://api.openai.com/v1"
pnpm --filter @igp/gateway dev
```

The stub adapter is configuration-only in Milestone 1 and does not make outbound API calls.

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
- Versioned `/v1/chat/completions` route with API key auth, validation, and adapter-based provider calls
- Environment-based config loading
- Structured JSON logging
- Request ID propagation and structured error responses
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
