# Inference Gateway Platform

Production-style scaffold for a distributed AI inference gateway. Milestone 3 adds Redis-backed request governance on top of the Milestone 2 routing layer: fixed-window per-key rate limits, deterministic daily token quotas, monthly budget enforcement, and simple abuse guards while keeping the gateway small and production-oriented.

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
$env:REDIS_URL="redis://localhost:6379"
$env:PRIMARY_PROVIDER_KIND="mock"
$env:PRIMARY_PROVIDER_ID="mock"
pnpm --filter @igp/gateway dev
```

The gateway exposes:

- `GET /health`
- `POST /v1/chat/completions`

The chat completions route expects:

- `x-api-key` header matching `GATEWAY_API_KEY`
- optional `x-request-id` header for correlation and governance retry idempotency
- `Content-Type: application/json`
- a normalized payload with `model` and `messages`

Routing is environment-configured:

- `PRIMARY_PROVIDER_KIND` and `PRIMARY_PROVIDER_ID` select the primary adapter
- `SECONDARY_PROVIDER_KIND` and `SECONDARY_PROVIDER_ID` optionally enable deterministic fallback
- `PROVIDER_TIMEOUT_MS`, `PROVIDER_MAX_RETRIES`, and `PROVIDER_RETRY_BACKOFF_MS` control the execution budget
- `REDIS_URL` and the `RATE_LIMIT_*`, `DAILY_TOKEN_QUOTA`, `MONTHLY_BUDGET_LIMIT_MINOR_UNITS`, and `ABUSE_*` settings control request governance

Milestone 3 governance policy:

- auth, JSON validation, and simple abuse guards run before provider execution
- fixed-window rate limiting counts admitted requests per API key
- token quota and monthly budget are charged once per admitted request using a deterministic request estimate
- retries and fallback do not create extra token or budget charges
- provider failures do not roll back the request-level estimate once the request is admitted
- if Redis is unavailable, the gateway fails closed with `503 governance_unavailable`
- daily token quotas reset at the next UTC midnight; monthly budgets reset at the next UTC month boundary

Request retry idempotency:

- clients may send `x-request-id`; the gateway echoes it and uses it as one input to governance idempotency
- the governance admission key is scoped to API key, `x-request-id`, and a SHA-256 fingerprint of the validated normalized payload
- the normalized payload fingerprint is derived from the trimmed `model` plus ordered trimmed `messages` roles and content
- reuse the same `x-request-id` only when retrying the same logical request; the same `x-request-id` with a different normalized payload is governed as a distinct request
- admitted request dedupe is retained for 24 hours independent of daily token and monthly budget bucket resets, so a retry across a UTC day or month rollover remains retry-safe within that window
- after 24 hours, the same logical request may be governed and charged again

Token approximation:

- `estimated_tokens = ceil((model.length + sum(message.content.length)) / TOKEN_ESTIMATE_CHARS_PER_TOKEN)`
- minimum estimated tokens per admitted request is `1`

Monthly cost approximation:

- `estimated_cost_minor_units = ceil(estimated_tokens * TOKEN_COST_PER_1K_MINOR_UNITS / 1000)`
- cost is tracked in integer minor units to avoid floating-point drift

Example request:

```sh
curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "x-api-key: local-dev-gateway-key" ^
  -d "{\"model\":\"mock-model\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}"
```

To exercise the real-provider adapter stub as the primary provider:

```sh
$env:PRIMARY_PROVIDER_KIND="real_stub"
$env:PRIMARY_PROVIDER_ID="openai-stub"
$env:REAL_PROVIDER_NAME="openai"
$env:REAL_PROVIDER_BASE_URL="https://api.openai.com/v1"
pnpm --filter @igp/gateway dev
```

To enable fallback from a retryable mock primary to a secondary mock provider:

```sh
$env:PRIMARY_PROVIDER_KIND="mock"
$env:PRIMARY_PROVIDER_ID="mock-primary"
$env:PRIMARY_MOCK_BEHAVIOR="retryable_failure"
$env:SECONDARY_PROVIDER_KIND="mock"
$env:SECONDARY_PROVIDER_ID="mock-secondary"
$env:SECONDARY_MOCK_BEHAVIOR="success"
pnpm --filter @igp/gateway dev
```

The real-provider adapter remains a stub in Milestone 3 and does not make outbound API calls.

Run the Python worker placeholder:

```sh
python workers/eval-worker/app/main.py
```

Start local infrastructure placeholders:

```sh
docker compose up -d
```

Local Redis-backed governance defaults are documented in `.env.example`. The compose file already exposes Redis on `localhost:6379`.

## Checks

```sh
pnpm run lint
pnpm run typecheck
pnpm run test
```

The root `test` script runs gateway tests and the eval worker unit tests.

## Milestone 3 Boundaries

Included:

- Repository scaffold
- Gateway health endpoint
- Versioned `/v1/chat/completions` route with API key auth, validation, and adapter-based provider calls
- Provider registry with deterministic primary and optional secondary routing
- Request-level provider timeout budgets
- Config-driven retries with backoff for retryable provider failures
- Config-driven fallback to a secondary provider
- Lightweight in-memory provider metrics
- Redis-backed fixed-window per-key request rate limiting
- Redis-backed daily token quota enforcement using a documented request-size estimate
- Redis-backed monthly budget enforcement using integer minor-unit cost accounting
- Simple abuse guards for message count and content size
- Environment-based config loading
- Structured JSON logging
- Request ID propagation and structured error responses
- Minimal gateway unit and integration tests
- Python eval worker placeholder and tests
- Docker Compose local dependency scaffold

Not included yet:

- Semantic caching
- Kafka event pipeline or runtime producer/consumer logic
- Kubernetes manifests
- Eval-backed routing
- Dynamic model or cost-based routing
- Streaming responses
- Live external provider integration
- Background jobs or reconciliation workers
- SQL-backed billing or quota persistence
