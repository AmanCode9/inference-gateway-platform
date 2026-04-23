# Architecture

## Milestone 1 Components

- TypeScript gateway: owns the public HTTP surface and process-level concerns such as config, logging, and health.
- Python eval worker: placeholder process for future evaluation work.
- OpenAPI contract: documents the current gateway HTTP API.
- AsyncAPI contract: records the future usage event shape without runtime Kafka logic.
- Docker Compose: starts local Postgres with pgvector and Redis for development readiness.

## Gateway

The gateway is a strict TypeScript Node service using the built-in HTTP server. It exposes:

- `GET /health`
- `POST /v1/chat/completions`

The chat completions endpoint is intentionally a placeholder in Milestone 1. It performs basic input validation and returns `501 Not Implemented`.

## Worker

The eval worker is a Python package skeleton with a placeholder entrypoint. It does not consume queues, call models, or influence routing in Milestone 1.

## Data and Events

Postgres, Redis, and future Kafka usage are represented only as local scaffolding and contracts. No application code reads from Redis, writes to Postgres, or emits Kafka messages yet.
