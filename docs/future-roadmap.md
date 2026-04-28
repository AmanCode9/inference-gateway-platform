# Future Roadmap

This project is frozen after Milestone 4E. The current repository demonstrates the core gateway architecture and safety model. Future work below is intentionally deferred and should be treated as a new project phase.

## Implemented Now

- Milestone 1: gateway foundation, health route, authenticated chat-completions route, validation, structured errors, request IDs, mock provider, real-provider stub.
- Milestone 2: provider registry, routing, timeout budgets, retry, fallback, and local provider metrics.
- Milestone 3: Redis-backed governance with rate limits, daily token quota, monthly budget, abuse guards, fail-closed behavior, and admission idempotency.
- Milestone 3.5: GitHub Actions CI, README polish, and architecture diagram.
- Milestone 4A: process-local exact cache foundation.
- Milestone 4B: Postgres-backed persistent exact cache with TTL enforcement.
- Milestone 4C: embedding boundary and deterministic mock embeddings.
- Milestone 4D: conservative semantic cache after exact cache miss.
- Milestone 4E: final documentation polish and project freeze.

## Deferred Intentionally

- Live chat provider integrations.
- Live embedding providers.
- Kafka runtime usage events.
- OpenTelemetry instrumentation and Grafana dashboards.
- Kubernetes manifests and deployment automation.
- Eval-backed routing.
- Streaming chat completions.
- SQL-backed billing/quota persistence.
- Admin APIs, dashboards, and cache invalidation tooling.
- pgvector runtime semantic search or ANN indexes.

## Why Deferred

- They would expand the project from gateway architecture into operations, observability, deployment, and vendor integration.
- Each item deserves its own milestone, tests, failure-mode analysis, and documentation.
- Adding them now would blur the core engineering story: safe request controls, resilient provider execution, and scoped cache behavior.
- The current project already demonstrates the backend/platform skills intended for a portfolio review.

## Production Extension Sequence

1. **Live provider integration**
   - Add one real provider adapter behind the existing provider interface.
   - Add secret management, provider-specific error mapping, and contract tests.

2. **OpenTelemetry and Grafana**
   - Add traces and metrics for request admission, provider execution, governance, and cache outcomes.
   - Build dashboards for latency, provider error rate, cache hit rate, and governance rejections.

3. **Kafka usage events**
   - Emit durable usage/admission/provider events from the gateway.
   - Keep the current synchronous governance path as the authority path.

4. **Kubernetes manifests**
   - Add deployment, service, config, secret references, probes, and resource limits.
   - Keep local Docker Compose as the development path.

5. **Eval-backed routing**
   - Feed offline or async evaluation signals into routing decisions.
   - Keep routing explainable and fail-safe.

6. **Streaming responses**
   - Extend the HTTP contract and provider abstraction for streaming.
   - Revisit cache and governance semantics explicitly before enabling it.

7. **SQL-backed billing persistence**
   - Persist billing records and reconcile with provider usage.
   - Keep Redis governance as the real-time admission path unless replaced by a designed alternative.

## Freeze Rule

No more major runtime systems should be added to this repository without opening a new project phase. Future work should start with a design note, acceptance criteria, and failure-mode review.
