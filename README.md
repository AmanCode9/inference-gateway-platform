# Inference Gateway Platform

Inference Gateway Platform is a production-style backend portfolio project for an AI inference gateway. It demonstrates a strict TypeScript HTTP gateway, authenticated chat-completions API surface, deterministic provider routing, timeout/retry/fallback behavior, Redis-backed request governance with fail-closed safety, and exact cache storage that can run in memory or persist to Postgres. The repository is intentionally scoped: it shows the shape of a distributed inference platform without claiming future features such as semantic caching, Kafka runtime pipelines, Kubernetes deployment, eval-backed routing, or live external provider calls.

## What Is Implemented

Milestone 1 - gateway foundation:

- TypeScript HTTP gateway using the built-in Node.js server.
- `GET /health` endpoint.
- `POST /v1/chat/completions` route.
- API key authentication through `x-api-key`.
- JSON parsing, request validation, request ID propagation, structured JSON errors, and structured logging.
- Python eval worker skeleton.
- Docker Compose local dependency scaffold.

Milestone 2 - provider execution:

- Provider registry built from environment configuration.
- Deterministic primary provider selection.
- Optional secondary provider fallback.
- Request-level timeout budgets.
- Bounded retry with backoff for retryable provider failures.
- Lightweight local provider metrics.
- Mock provider for local testing and a real-provider stub that intentionally does not call external APIs.

Milestone 3 - Redis-backed governance:

- Fixed-window per-API-key request rate limiting.
- Daily token quota enforcement using a deterministic request-size estimate.
- Monthly budget enforcement using integer minor-unit accounting.
- Abuse guards for message count and content size.
- Fail-closed `503 governance_unavailable` behavior when governance storage is unavailable.
- Request-scoped governance idempotency keyed by API key, `x-request-id`, and a SHA-256 fingerprint of the validated normalized chat payload.
- A 24-hour admission dedupe window independent of daily and monthly bucket reset boundaries.

Milestone 3.5 - repository quality:

- GitHub Actions CI for lint, typecheck, and tests.
- Portfolio-ready README with architecture diagram, local setup, environment guidance, roadmap, and production-readiness notes.

Milestone 4A - exact cache foundation:

- Process-local, non-persistent exact cache for successful chat-completions provider responses.
- Canonical normalized cache keys scoped by hashed API key/tenant and exact request payload.
- Cache lookup runs only after auth, validation, and governance admission.
- Fail-open cache read/write behavior.
- `x-cache-status` response header with `miss`, `hit-exact`, or `bypass`.

Milestone 4B - persistent exact cache storage:

- Optional Postgres-backed implementation of the existing exact-cache repository boundary.
- `exact_cache_entries` table for successful provider responses only.
- Configurable memory or Postgres cache backend.
- Postgres TTL enforcement on reads; expired rows behave as misses.
- Parameterized SQL queries and tenant isolation without storing raw API keys.

## Architecture

```mermaid
flowchart LR
  Client[Client] --> Gateway[TypeScript Gateway]
  Gateway --> RequestContext[Request Context<br/>x-request-id + logging]
  RequestContext --> AuthValidation[Auth / Content-Type / JSON Validation]
  AuthValidation --> Governance[Governance Layer<br/>rate limit + quota + budget + abuse guards]
  Governance <--> Redis[(Redis<br/>Milestone 3 governance state)]
  Governance --> ExactCache[Exact Cache Service<br/>fail-open optimization]
  ExactCache <--> MemoryCache[(In-memory Cache<br/>process-local)]
  ExactCache <--> PostgresCache[(Postgres exact_cache_entries<br/>Milestone 4B persistent exact cache)]
  ExactCache --> ProviderExecution[Provider Execution Layer<br/>timeout + retry + fallback]
  ProviderExecution --> MockProvider[Mock Provider]
  ProviderExecution --> RealStub[Real Provider Stub<br/>no outbound API calls]
  Gateway -. placeholder .-> EvalWorker[Python Eval Worker<br/>future evaluation work]
  Gateway -. future contract only .-> Kafka[(Kafka<br/>future usage events)]
  Gateway -. future semantic cache only .-> Pgvector[(pgvector<br/>no semantic lookup yet)]
```

Current request flow:

1. Client sends a chat-completions request.
2. Gateway creates or propagates `x-request-id`.
3. API key authentication and JSON validation run before governance.
4. Governance applies abuse checks, usage estimation, rate limit, daily quota, and monthly budget admission.
5. Exact cache lookup runs if enabled; the configured backend is memory or Postgres, and cache failures fail open.
6. On an exact hit, the cached provider completion is returned with the current request ID.
7. On a miss or bypass, provider execution runs with timeout, retry, and optional fallback.
8. The final response is returned with the request ID and `x-cache-status`.

## Repository Structure

- `services/gateway/` - TypeScript HTTP gateway.
- `workers/eval-worker/` - Python eval worker placeholder.
- `openapi/` - gateway HTTP API contract.
- `asyncapi/` - future usage-event contract placeholder.
- `docs/` - product, architecture, and non-functional notes.
- `infra/` - local infrastructure notes and future IaC location.
- `dashboards/` - future Grafana dashboard assets.
- `.github/workflows/` - GitHub Actions CI.

## Local Development

Prerequisites:

- Node.js 20 or newer.
- pnpm 10 or newer.
- Python 3.12.
- Docker Compose, optional but recommended for local Redis/Postgres scaffolding.

Install dependencies:

```sh
pnpm install
```

Start local dependencies:

```sh
docker compose up -d
```

Apply the optional Postgres exact-cache schema when using `CACHE_BACKEND=postgres`:

```sh
psql "postgres://inference_gateway:inference_gateway_dev@localhost:5432/inference_gateway" -f infra/postgres/migrations/001_exact_cache_entries.sql
```

Run the opt-in live Postgres exact-cache repository test:

```sh
$env:POSTGRES_CACHE_TEST_DATABASE_URL="postgres://inference_gateway:inference_gateway_dev@localhost:5432/inference_gateway"
pnpm --filter @igp/gateway test -- tests/integration/postgres-cache-live.test.ts
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

Example request:

```sh
curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "x-api-key: local-dev-gateway-key" ^
  -H "x-request-id: req_local_demo" ^
  -d "{\"model\":\"mock-model\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}"
```

Run the Python worker placeholder:

```sh
python workers/eval-worker/app/main.py
```

## Configuration

Local defaults are documented in `.env.example`. The gateway requires at least:

- `GATEWAY_API_KEY` - API key expected in the `x-api-key` request header.
- `REDIS_URL` - Redis connection URL used by governance.

Provider execution:

- `PRIMARY_PROVIDER_KIND`, `PRIMARY_PROVIDER_ID` - primary provider selection.
- `PRIMARY_MOCK_BEHAVIOR`, `PRIMARY_MOCK_DELAY_MS` - mock provider behavior for local testing.
- `SECONDARY_PROVIDER_KIND`, `SECONDARY_PROVIDER_ID` - optional fallback provider.
- `PROVIDER_TIMEOUT_MS`, `PROVIDER_MAX_RETRIES`, `PROVIDER_RETRY_BACKOFF_MS` - execution budget and retry behavior.

Governance:

- `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS` - fixed-window per-key request limit.
- `DAILY_TOKEN_QUOTA` - daily token estimate quota.
- `MONTHLY_BUDGET_LIMIT_MINOR_UNITS` - monthly budget in integer minor units.
- `TOKEN_ESTIMATE_CHARS_PER_TOKEN`, `TOKEN_COST_PER_1K_MINOR_UNITS` - deterministic usage approximation.
- `ABUSE_MAX_MESSAGE_COUNT`, `ABUSE_MAX_MESSAGE_CHARACTERS`, `ABUSE_MAX_TOTAL_MESSAGE_CHARACTERS` - abuse guard thresholds.

Exact cache:

- `CACHE_ENABLED` - enables exact cache lookup when set to `true`; defaults to `false`.
- `EXACT_CACHE_ENABLED` - legacy Milestone 4A alias for `CACHE_ENABLED`; if both are set, they must agree.
- `CACHE_BACKEND` - `memory` or `postgres`; defaults to `memory`.
- `CACHE_TTL_SECONDS` - Postgres exact-cache TTL in seconds; defaults to `86400`.
- `DATABASE_URL` - required when `CACHE_BACKEND=postgres`.
- `CACHE_POSTGRES_OPERATION_TIMEOUT_MS` - bounded Postgres cache operation timeout; defaults to `250`.

The real-provider adapter remains a Milestone 3 stub. Selecting `real_stub` validates configuration and returns a documented not-implemented response instead of calling an external API.

## Governance Policy

- Auth failures, malformed JSON, validation failures, and abuse-rejected requests do not consume governance counters.
- Rate limits count admitted requests per API key.
- Token quota and monthly budget are charged once per admitted request before provider execution.
- Provider retries and fallback do not add extra token or budget charges.
- Provider failures do not roll back usage once the request has been admitted.
- Redis failures do not bypass governance; the gateway fails closed with `503 governance_unavailable`.

Request retry idempotency:

- Clients may send `x-request-id`; the gateway echoes it in responses.
- Governance admission is scoped to API key, `x-request-id`, and a SHA-256 fingerprint of the validated normalized payload.
- The normalized payload fingerprint is derived from the trimmed `model` plus ordered trimmed `messages` roles and content.
- Reusing the same `x-request-id` with the same normalized payload is treated as the same logical governance admission for 24 hours.
- Reusing the same `x-request-id` with a different normalized payload is governed as a distinct request.
- After the 24-hour dedupe window, the same logical request may be governed and charged again.

Usage approximation:

- `estimated_tokens = ceil((model.length + sum(message.content.length)) / TOKEN_ESTIMATE_CHARS_PER_TOKEN)`
- `estimated_cost_minor_units = ceil(estimated_tokens * TOKEN_COST_PER_1K_MINOR_UNITS / 1000)`
- Minimum estimate per admitted request is `1` token and `1` minor unit.

## Exact Cache Policy

- Exact cache is disabled by default and enabled with `CACHE_ENABLED=true`.
- `CACHE_BACKEND=memory` uses the process-local Milestone 4A repository.
- `CACHE_BACKEND=postgres` uses the Milestone 4B `exact_cache_entries` table.
- Cache lookup happens only after request ID creation, auth, content-type validation, JSON validation, and governance admission.
- Cache hits still pass through Milestone 3 governance; cache does not change rate, quota, or budget accounting semantics.
- Cache keys include a schema version, hashed API key/tenant identity, and a SHA-256 hash of the canonical normalized request payload.
- The canonical payload includes all currently supported response-affecting chat request fields: `model` and ordered `messages` with `role` and `content`.
- Object keys are sorted recursively, array order is preserved, and undefined fields are removed before hashing.
- Cache repositories store successful provider responses only.
- The Postgres backend stores `response_body` as JSONB plus safe metadata such as tenant hash, request fingerprint, model, provider id, cache policy version, and expiry.
- Postgres lookups ignore rows where `expires_at <= now()`; expired entries behave as cache misses.
- Cache read failures return `x-cache-status: bypass` and call the provider normally.
- Cache write failures return the provider response successfully with `x-cache-status: miss`.
- The memory backend is process-local and non-persistent.
- The Postgres backend is persistent exact cache storage. It is not semantic caching and does not use embeddings, pgvector, or similarity search.

## Checks and CI

Run the same checks locally that CI runs:

```sh
pnpm run lint
pnpm run typecheck
pnpm run test
```

The root `test` script runs:

- gateway unit and integration tests through Vitest
- eval worker tests through Python `unittest`

The default suite does not require Docker or a live Postgres service. The live Postgres exact-cache test is opt-in through `POSTGRES_CACHE_TEST_DATABASE_URL`.

GitHub Actions runs these checks on `push` and `pull_request` to `main` using Node.js 20, pnpm, and Python 3.12.

## Roadmap

Implemented:

- Milestone 1: authenticated chat-completions gateway slice.
- Milestone 2: provider registry, routing, timeout budgets, retries, fallback, and local metrics.
- Milestone 3: Redis-backed governance with rate limits, quotas, budget tracking, abuse guards, fail-closed behavior, and idempotent admission.
- Milestone 3.5: CI, README polish, and architecture diagram.
- Milestone 4A: process-local exact cache foundation.
- Milestone 4B: persistent Postgres exact cache storage.

Next planned feature milestone:

- Milestone 4C: semantic caching foundation.

Future milestones, not implemented yet:

- Semantic caching.
- Kafka usage event pipeline.
- Kubernetes manifests.
- Eval-backed routing.
- Live external provider integrations.
- Dynamic model or cost-based routing.
- Streaming responses.
- SQL-backed billing or quota persistence.
- Background reconciliation workers.

## Production-Readiness Notes

Current production-oriented qualities:

- Strict TypeScript configuration.
- Explicit config validation at startup.
- Deterministic error response shape with `requestId`.
- Request-scoped structured logging.
- Fail-closed governance behavior.
- Atomic Redis Lua admission path for governance counters and idempotency.
- Fail-open exact cache path with memory or Postgres backend.
- CI covering lint, typecheck, gateway tests, and eval-worker tests.

Intentional boundaries:

- No semantic caching.
- No Kafka runtime producer or consumer logic.
- No Kubernetes manifests.
- No eval-backed routing.
- No live external provider calls.
- No SQL/Postgres governance persistence.
- No semantic cache, embeddings, pgvector lookup, or similarity search in Milestone 4B.
