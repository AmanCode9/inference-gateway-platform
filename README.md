# Inference Gateway Platform

Inference Gateway Platform is a production-style backend/platform portfolio project for an AI inference gateway. It demonstrates a strict TypeScript HTTP gateway, authenticated chat-completions API surface, deterministic provider routing, timeout/retry/fallback behavior, Redis-backed usage governance, exact cache storage, Postgres persistence, an embedding boundary, and a conservative semantic-cache layer.

The project exists to show the engineering shape of a serious inference gateway without pretending to be a full SaaS platform. It focuses on request safety, deterministic failure behavior, tenant isolation, clear extension boundaries, and test-backed backend design. Future systems such as live provider integrations, Kafka runtime pipelines, Kubernetes deployment, OpenTelemetry, eval-backed routing, and live embedding providers are intentionally documented as out of scope.

## At A Glance

- **What it is:** a TypeScript AI inference gateway with auth, validation, governance, provider execution, and caching.
- **Why it is credible:** platform controls run before optimization paths; governance fails closed; cache fails open; tenant isolation is enforced.
- **What it demonstrates:** backend API design, resilience patterns, Redis accounting, Postgres persistence, deterministic testing, and scoped architecture.
- **What it does not claim:** no live LLM calls, no live embeddings, no Kafka runtime, no Kubernetes deployment, no OpenTelemetry pipeline, no pgvector runtime search.
- **How to verify it:** run `pnpm run lint`, `pnpm run typecheck`, and `pnpm run test`.

## Production-Style Qualities

- Explicit startup config validation.
- Request-scoped IDs and structured JSON errors.
- Auth and validation before governance, and governance before cache.
- Fail-closed Redis governance for rate/quota/budget controls.
- Fail-open cache behavior because cache is an optimization.
- Tenant-isolated exact and semantic cache paths.
- Conservative semantic cache policy that prefers false misses over risky hits.
- CI coverage for lint, typecheck, gateway tests, and eval-worker tests.

## Implemented Milestones

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

Milestone 4C - embedding boundary foundation:

- Embedding provider interface for future semantic-cache work.
- Deterministic mock embedding provider with fixed dimensions and no external calls.
- Stable embedding input builder for validated chat-completions requests.
- Disabled-by-default embedding configuration.
- No semantic cache lookup, pgvector runtime query, or embedding persistence.

Milestone 4D - conservative semantic cache:

- Semantic cache lookup after exact cache miss only.
- Disabled-by-default semantic cache configuration with a strict similarity threshold.
- Conservative eligibility policy that rejects freshness-sensitive, context-dependent, sensitive, and multi-turn prompts.
- Tenant-isolated, model-compatible semantic hits using deterministic mock embeddings.
- Fail-open semantic read/write/embedding behavior.
- `x-cache-status: hit-semantic` only when all safety checks pass.

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
  ExactCache <--> PostgresCache[(Postgres exact_cache_entries<br/>exact + semantic metadata)]
  ExactCache --> SemanticCache[Conservative Semantic Cache<br/>exact miss only]
  SemanticCache <--> EmbeddingBoundary[Embedding Boundary<br/>deterministic mock embeddings]
  SemanticCache --> ProviderExecution[Provider Execution Layer<br/>timeout + retry + fallback]
  ExactCache --> ProviderExecution
  ProviderExecution --> MockProvider[Mock Provider]
  ProviderExecution --> RealStub[Real Provider Stub<br/>no outbound API calls]
  Gateway -. placeholder .-> EvalWorker[Python Eval Worker<br/>future evaluation work]
  Gateway -. future contract only .-> Kafka[(Kafka<br/>future usage events)]
  EmbeddingBoundary -. future vector search only .-> Pgvector[(pgvector<br/>not used at runtime)]
```

Current request flow:

1. Client sends a chat-completions request.
2. Gateway creates or propagates `x-request-id`.
3. API key authentication and JSON validation run before governance.
4. Governance applies abuse checks, usage estimation, rate limit, daily quota, and monthly budget admission.
5. Exact cache lookup runs if enabled; the configured backend is memory or Postgres, and cache failures fail open.
6. On an exact hit, the cached provider completion is returned with the current request ID.
7. On exact miss, semantic cache may run only when explicitly enabled and policy-eligible.
8. On semantic hit, a tenant/model-compatible cached completion is returned with the current request ID.
9. On miss, bypass, rejection, or cache error, provider execution runs with timeout, retry, and optional fallback.
10. The final response is returned with the request ID and `x-cache-status`.

## Demo Path

For a quick local walkthrough:

1. Install dependencies with `pnpm install`.
2. Start local Redis/Postgres with `docker compose up -d`.
3. Run checks with `pnpm run lint`, `pnpm run typecheck`, and `pnpm run test`.
4. Start the gateway with the PowerShell environment variables in [docs/demo-script.md](docs/demo-script.md).
5. Call `GET /health`, then `POST /v1/chat/completions`.
6. Repeat the same chat request with `CACHE_ENABLED=true` to demonstrate `x-cache-status: miss` then `hit-exact`.
7. Use the targeted semantic-cache test in the demo script to show the conservative `hit-semantic` path without relying on natural-language embedding quality from the deterministic mock provider.

The fastest two-minute explanation is in [docs/recruiter-brief.md](docs/recruiter-brief.md). The design rationale is in [docs/design-decisions.md](docs/design-decisions.md).

## Repository Structure

- `services/gateway/` - TypeScript HTTP gateway.
- `workers/eval-worker/` - Python eval worker placeholder.
- `openapi/` - gateway HTTP API contract.
- `asyncapi/` - future usage-event contract placeholder.
- `docs/` - architecture, design decisions, demo script, recruiter brief, roadmap, and non-functional notes.
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
psql "postgres://inference_gateway:inference_gateway_dev@localhost:5432/inference_gateway" -f infra/postgres/migrations/002_semantic_cache_metadata.sql
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

Embedding foundation:

- `EMBEDDING_PROVIDER` - `disabled` or `mock`; defaults to `disabled`.
- `EMBEDDING_DIMENSIONS` - deterministic mock embedding dimensions; defaults to `384`.

Semantic cache:

- `SEMANTIC_CACHE_ENABLED` - enables conservative semantic lookup after exact miss; defaults to `false`.
- `SEMANTIC_CACHE_THRESHOLD` - cosine similarity threshold; defaults to `0.97`.
- `SEMANTIC_CACHE_MAX_CANDIDATES` - bounded candidate count for tenant/model-filtered lookup; defaults to `10`.
- `SEMANTIC_CACHE_POLICY_VERSION` - semantic compatibility policy version; defaults to `v1`.
- Semantic cache requires `CACHE_ENABLED=true` and `EMBEDDING_PROVIDER=mock`.

The real-provider stub adapter does not call external APIs. Selecting `real_stub` validates configuration and returns a documented not-implemented response.

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
- The Postgres backend is persistent exact cache storage with optional semantic metadata. It does not use pgvector or ANN/vector-index lookup.

## Embedding Foundation Policy

- Embeddings are disabled by default and are generated in the chat-completions runtime path only when semantic cache is explicitly enabled.
- The embedding boundary is provider-agnostic and async so future real embedding providers can fit behind it.
- The deterministic mock provider is local-only, hash-based, and makes no network calls.
- Embedding input is built from the validated chat payload's ordered messages with role and content.
- Embedding input excludes API keys, tenant data, request IDs, headers, exact cache keys, governance metadata, and provider routing metadata.
- No live embedding provider, pgvector runtime query, or external embedding API exists.

## Semantic Cache Policy

- Semantic cache is disabled by default and runs only after an exact cache miss.
- Semantic hits require the same hashed tenant identity, same model, same embedding provider, same embedding dimensions, same policy version, compatible system prompt hash, and similarity at or above the configured threshold.
- The eligibility policy is intentionally conservative. It rejects assistant-history/multi-turn requests and prompts with obvious freshness, sensitive-data, attachment, prior-context, legal, medical, or financial indicators.
- False misses are preferred over risky false hits.
- Semantic cache failures fail open: embedding errors, repository read errors, invalid candidates, and write errors call or return the provider path normally.
- Semantic hits return `x-cache-status: hit-semantic`. Similarity scores, embeddings, cache keys, and tenant hashes are not exposed.
- Semantic metadata may be stored in Postgres as JSONB for bounded candidate comparison in TypeScript. pgvector is not used for runtime lookup in Milestone 4D.

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
- Milestone 4C: embedding boundary and deterministic mock embeddings.
- Milestone 4D: conservative semantic cache.
- Milestone 4E: final documentation polish and project freeze.

Next planned work:

- Release/tag, resume polish, and interview preparation only.

Future milestones, not implemented yet:

- Live embedding providers.
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
- Conservative fail-open semantic cache path disabled by default.
- CI covering lint, typecheck, gateway tests, and eval-worker tests.

Intentional boundaries:

- No live embedding provider.
- No Kafka runtime producer or consumer logic.
- No Kubernetes manifests.
- No eval-backed routing.
- No live external provider calls.
- No SQL/Postgres governance persistence.
- No pgvector runtime query or ANN/vector-index semantic search.
