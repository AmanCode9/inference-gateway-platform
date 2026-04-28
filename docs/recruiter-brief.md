# Recruiter Brief

## 30-Second Pitch

Inference Gateway Platform is a production-style backend project that implements the core control plane for an AI inference gateway: authenticated chat completions, request validation, provider routing with retry/fallback, Redis-backed governance, exact caching, Postgres persistence, an embedding boundary, and conservative semantic caching.

It is intentionally scoped to show backend/platform engineering judgment: correctness before features, governance before optimization, fail-closed controls, fail-open cache, tenant isolation, deterministic tests, and clear future boundaries.

## Two-Minute Walkthrough

The gateway exposes `GET /health` and `POST /v1/chat/completions`. A chat request is assigned or echoes `x-request-id`, then goes through API key auth, JSON validation, Redis-backed governance, cache lookup, and provider execution.

Milestone 2 adds provider routing, timeout budgets, retries, fallback, and local metrics. Milestone 3 adds Redis-backed rate limiting, daily token quota, monthly budget tracking, abuse guards, and request-scoped idempotency. Milestones 4A and 4B add exact cache with in-memory and Postgres backends. Milestone 4C adds a deterministic embedding boundary. Milestone 4D adds a conservative semantic cache after exact cache miss only.

The key engineering point is ordering. Governance is authoritative and fails closed. Cache is an optimization and fails open. Semantic cache is intentionally conservative and tenant-isolated because false positives can return the wrong answer.

## Key Technical Highlights

- TypeScript HTTP gateway using Node's built-in server.
- API key auth, JSON parsing, validation, structured errors, and request ID propagation.
- Config-driven provider registry with timeout, retry, fallback, and local metrics.
- Redis-backed rate limiting, daily quota, monthly budget, abuse guards, and governance idempotency.
- Exact cache with canonical normalized keys, tenant isolation, and `x-cache-status`.
- Postgres-backed persistent exact cache with TTL enforcement.
- Embedding provider boundary with deterministic mock embeddings.
- Conservative semantic cache with policy rejection, tenant/model compatibility, strict similarity threshold, and fail-open behavior.
- GitHub Actions CI for lint, typecheck, gateway tests, and eval-worker tests.

## Architecture Summary

Request flow:

`request -> auth -> validation -> governance -> exact cache -> semantic cache after exact miss -> provider execution`

Data systems:

- Redis: governance counters and admission idempotency.
- Postgres: persistent exact cache entries and optional semantic metadata.
- pgvector: available in local infrastructure, not used for runtime semantic lookup.
- Kafka: AsyncAPI/future contract only, no runtime producer or consumer.

## Safety And Reliability Highlights

- Governance fails closed to prevent uncontrolled provider usage.
- Cache fails open to preserve availability after governance admission.
- Cache cannot bypass auth, validation, or governance.
- Tenant/API-key isolation is enforced for exact and semantic cache paths.
- Semantic cache rejects risky prompt shapes and prefers false misses.
- No raw API keys, request headers, or request IDs are stored in cache metadata.
- Error responses preserve `requestId` for client correlation.

## What I Built And Learned

- Built a staged backend/platform system with clear milestone boundaries.
- Practiced correctness-first design for request admission and accounting.
- Implemented deterministic tests for retry/fallback, governance, cache idempotency, TTL, and semantic-cache safety.
- Kept future systems documented without prematurely adding runtime complexity.

## Interview Talking Points

- Why governance runs before cache.
- Why governance fails closed and cache fails open.
- How request-scoped idempotency prevents double charging.
- Why exact cache is safer than semantic cache.
- How tenant isolation is enforced.
- How to extend from mock providers to live providers without changing route semantics.
- What Kafka, OpenTelemetry, Kubernetes, and eval routing would add in a production phase.

## Resume Bullets

- Built a production-style TypeScript AI inference gateway with API key auth, request validation, provider routing, timeout/retry/fallback behavior, structured errors, and request ID propagation.
- Implemented Redis-backed governance for per-key rate limits, daily token quota, monthly budget enforcement, abuse protection, fail-closed behavior, and request-scoped idempotency.
- Added tenant-isolated exact and conservative semantic caching with in-memory/Postgres backends, TTL enforcement, deterministic mock embeddings, fail-open cache semantics, and CI-backed tests.

## Future Roadmap

Future production extensions would include live provider adapters, live embedding providers, OpenTelemetry/Grafana, Kafka usage events, Kubernetes manifests, eval-backed routing, streaming responses, and SQL-backed billing persistence. They are intentionally not implemented in this project phase.
