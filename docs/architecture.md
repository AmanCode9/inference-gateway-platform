# Architecture

## Milestone 2 Components

- TypeScript gateway: owns the public HTTP surface and process-level concerns such as config, logging, and health.
- Python eval worker: placeholder process for future evaluation work.
- OpenAPI contract: documents the current gateway HTTP API.
- AsyncAPI contract: records the future usage event shape without runtime Kafka logic.
- Docker Compose: starts local Postgres with pgvector and Redis for development readiness.

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

The real-provider adapter is intentionally non-functional in Milestone 2 and returns a clear not-implemented error rather than making outbound API calls.

## Worker

The eval worker is a Python package skeleton with a placeholder entrypoint. It does not consume queues, call models, or influence routing in Milestone 1.

## Data and Events

Postgres, Redis, and future Kafka usage are represented only as local scaffolding and contracts. No application code reads from Redis, writes to Postgres, or emits Kafka messages yet.
