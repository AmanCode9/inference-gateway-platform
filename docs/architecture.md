# Architecture

## Milestone 4A Components

- TypeScript gateway: owns the public HTTP surface and process-level concerns such as config, logging, and health.
- Python eval worker: placeholder process for future evaluation work.
- OpenAPI contract: documents the current gateway HTTP API.
- AsyncAPI contract: records the future usage event shape without runtime Kafka logic.
- Docker Compose: starts local Postgres with pgvector and Redis for local development.
- Process-local exact cache: optional Milestone 4A cache for successful chat-completions responses.

## Gateway

The gateway is a strict TypeScript Node service using the built-in HTTP server. It exposes:

- `GET /health`
- `POST /v1/chat/completions`

The gateway establishes a request context per call, including:

- request ID generation or propagation through `x-request-id`
- structured request-scoped logging
- centralized JSON error responses

The chat completions endpoint performs:

- API key authentication through `x-api-key`
- JSON request validation for a normalized chat payload
- provider invocation through an adapter interface

Milestone 3 adds a governance layer between request validation and provider execution:

- abuse guard for message count and content-size thresholds
- Redis-backed fixed-window request rate limiting per API key
- Redis-backed daily token quota enforcement
- Redis-backed monthly budget enforcement
- fail-closed `503 governance_unavailable` behavior when Redis is unavailable

The Milestone 3 request flow is:

1. request enters the gateway
2. API key auth succeeds
3. request body is parsed and validated
4. abuse guard rejects obviously oversized message shapes
5. the governance service computes a deterministic request estimate
6. an atomic Redis-backed governance admission step applies rate-limit, token-quota, and monthly-budget checks
7. the Milestone 4A exact cache checks for a tenant-isolated payload match when enabled
8. the Milestone 2 provider execution layer runs with timeout, retry, and optional fallback on cache miss, bypass, or cache read failure
9. the final response is returned without additional quota or budget charging

Chosen governance and accounting policy:

- rate limiting counts admitted requests in a fixed window
- token and budget accounting charge once per admitted request before provider execution
- retries and fallback do not add extra governance usage
- auth failures, malformed JSON, and abuse-rejected requests do not consume provider quota or budget
- Redis failures do not bypass governance; they fail closed with a stable `503`
- governance idempotency is keyed by API key, `x-request-id`, and a SHA-256 fingerprint of the validated normalized payload
- the same `x-request-id` with a different normalized payload is governed as a distinct request rather than reusing the prior admission
- exact cache hits still pass through governance and do not change rate, quota, or budget accounting

Deterministic approximation rules:

- token estimate: `ceil((model.length + sum(message.content.length)) / TOKEN_ESTIMATE_CHARS_PER_TOKEN)`
- cost estimate: `ceil(estimated_tokens * TOKEN_COST_PER_1K_MINOR_UNITS / 1000)`
- monthly cost is stored in integer minor units to avoid floating-point drift
- daily quota buckets reset at UTC midnight and monthly budget buckets reset at the next UTC month boundary
- admission dedupe entries live for 24 hours independent of daily and monthly bucket resets, so retries of the same logical request remain safe across UTC rollover within that bounded window

Milestone 4A adds a narrow exact-cache layer after governance and before provider execution:

- cache is disabled by default and enabled by `EXACT_CACHE_ENABLED=true`
- keys include a schema version, hashed API key/tenant identity, and the canonical normalized chat request payload
- canonicalization sorts object keys recursively, preserves array order, removes undefined fields, and covers the current validated `model` and ordered `messages` role/content fields
- read and write failures fail open and call or return the provider path normally
- cache status is reported on successful chat-completions responses as `x-cache-status: miss`, `hit-exact`, or `bypass`
- the Milestone 4A repository is process-local and non-persistent; no Postgres, pgvector, or semantic lookup is used

Milestone 2 adds a deterministic execution layer beneath the route:

- provider registry built from environment-configured provider definitions
- primary provider selection with optional secondary fallback
- request-level timeout budget for provider execution
- bounded retries with backoff for retryable provider failures
- lightweight in-memory metrics for provider selection, success, failure, retry, fallback, and timeout events

Provider routing remains intentionally simple:

- primary provider is selected from config
- optional secondary provider is selected from config
- no dynamic policy routing, eval-based routing, or cost-based routing is present

Provider adapters available in Milestone 2:

- mock provider for local development and failure simulation in tests
- real-provider stub selected through environment configuration

The real-provider adapter is intentionally non-functional in Milestone 3 and returns a clear not-implemented error rather than making outbound API calls.

## Worker

The eval worker is a Python package skeleton with a placeholder entrypoint. It does not consume queues, call models, or influence routing in Milestone 3.

## Data and Events

Redis is now used only for Milestone 3 governance state: rate-limit counters, daily token counters, and monthly budget counters. Postgres and Kafka remain local scaffolding and contracts only; no application code writes to Postgres or emits Kafka messages yet.
