# Design Decisions

This document captures the main engineering decisions behind the Inference Gateway Platform. The project is intentionally scoped as a production-style portfolio backend, not a complete hosted inference product.

## Decision 1: Auth, Validation, And Governance Run Before Cache

The gateway orders controls as:

`auth -> content-type/body parsing -> validation -> governance -> cache -> provider`

Cache must never become a bypass around platform controls. An unauthenticated, malformed, abuse-rejected, quota-rejected, or rate-limited request should not be able to retrieve a cached response.

## Decision 2: Governance Fails Closed

Rate limits, token quotas, and budget checks are authority paths. If Redis-backed governance storage is unavailable, the gateway returns `503 governance_unavailable` instead of allowing uncontrolled usage.

This is stricter than a consumer app might choose, but it is the right default for an inference gateway where provider cost and abuse exposure matter.

## Decision 3: Cache Fails Open

Cache is an optimization, not an authority. If an exact cache read/write, semantic candidate lookup, or semantic metadata write fails, the gateway continues through the provider path when governance has already admitted the request.

This keeps availability from depending on cache health while preserving governance as the control plane.

## Decision 4: Exact Cache Comes Before Semantic Cache

Exact cache is deterministic: same tenant, same normalized payload, same key. Semantic cache carries false-positive risk because similar inputs are not always interchangeable.

The gateway checks exact cache first. Semantic cache is attempted only after an exact miss, and exact hits do not invoke embeddings or semantic lookup.

## Decision 5: Semantic Cache Is Conservative

The semantic cache is designed to prove safe platform thinking, not high hit rate. It rejects multi-turn or assistant-history requests, freshness-sensitive prompts, sensitive-data prompts, attachment/context references, and legal/medical/financial advice prompts.

False misses are acceptable. Risky false hits are not.

## Decision 6: Tenant Isolation Is Mandatory

Cache entries are scoped by hashed API-key/tenant identity. Semantic candidates are also filtered by tenant hash, model, embedding provider, embedding dimensions, semantic policy version, system prompt hash, and expiry.

Cached responses must never cross API-key or tenant boundaries.

## Decision 7: Postgres Stores Exact And Semantic Metadata, Pgvector Runtime Lookup Is Deferred

Postgres persistence demonstrates durable cache storage and bounded semantic candidate retrieval. Semantic embeddings are stored as JSONB metadata and compared in TypeScript over a small, configured candidate set.

The project intentionally does not add pgvector runtime lookup or ANN indexes. That would be a separate production-scaling milestone with its own evaluation and operational tradeoffs.

## Decision 8: Live Providers Are Stubbed

The real-provider adapter is intentionally a stub. This keeps the project focused on gateway architecture, request safety, routing, governance, caching, and tests rather than vendor SDK setup, secret management, or outbound network behavior.

Mock providers and deterministic mock embeddings make the test suite stable and local.

## Decision 9: Kafka, Kubernetes, OpenTelemetry, And Eval Routing Are Deferred

Kafka, Kubernetes, OpenTelemetry/Grafana, and eval-backed routing are documented as future extension points, not implemented runtime systems.

Adding them would increase surface area without improving the core project claim: a disciplined inference gateway with correct request controls, resilient provider execution, and safe caching.

## Decision 10: The Project Freezes After Milestone 4D/4E

The project now demonstrates the intended backend/platform skills:

- API gateway structure
- auth and validation
- provider routing and resilience
- Redis-backed governance
- exact and persistent caching
- embedding boundary
- conservative semantic caching
- CI, tests, docs, and explicit non-goals

Further major runtime systems should be treated as a new project phase, not incremental polish.
