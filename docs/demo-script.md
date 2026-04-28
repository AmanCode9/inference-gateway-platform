# Demo Script

This script is written for Windows PowerShell and a local developer machine.

## Prerequisites

- Node.js 20 or newer
- pnpm 10 or newer
- Python 3.12
- Docker Compose
- Optional: `psql` if you want to apply Postgres cache migrations locally

## Install And Validate

```powershell
pnpm install
pnpm run lint
pnpm run typecheck
pnpm run test
```

The default test suite does not require Docker or a live Postgres database.

## Start Local Dependencies

```powershell
docker compose up -d
```

If using `CACHE_BACKEND=postgres`, apply the cache schema:

```powershell
psql "postgres://inference_gateway:inference_gateway_dev@localhost:5432/inference_gateway" -f infra/postgres/migrations/001_exact_cache_entries.sql
psql "postgres://inference_gateway:inference_gateway_dev@localhost:5432/inference_gateway" -f infra/postgres/migrations/002_semantic_cache_metadata.sql
```

## Run The Gateway

Start with memory cache for the simplest demo:

```powershell
$env:GATEWAY_API_KEY="local-dev-gateway-key"
$env:REDIS_URL="redis://localhost:6379"
$env:PRIMARY_PROVIDER_KIND="mock"
$env:PRIMARY_PROVIDER_ID="mock"
$env:CACHE_ENABLED="true"
$env:CACHE_BACKEND="memory"
$env:EMBEDDING_PROVIDER="mock"
$env:SEMANTIC_CACHE_ENABLED="false"
pnpm --filter @igp/gateway dev
```

Use a second terminal for requests.

## Health Check

```powershell
curl.exe http://localhost:3000/health
```

Expected: HTTP `200` with service metadata and an `x-request-id` response header.

## Normal Chat Completion

```powershell
curl.exe -X POST http://localhost:3000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "x-api-key: local-dev-gateway-key" `
  -H "x-request-id: req_demo_normal" `
  -d '{"model":"mock-model","messages":[{"role":"user","content":"Hello from the demo"}]}'
```

Expected: HTTP `200`, `requestId: req_demo_normal`, provider `mock`, and `x-cache-status`.

## Exact Cache Demo

Run the same normalized payload twice with different request IDs:

```powershell
curl.exe -X POST http://localhost:3000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "x-api-key: local-dev-gateway-key" `
  -H "x-request-id: req_exact_first" `
  -d '{"model":"mock-model","messages":[{"role":"user","content":"Explain DNS simply"}]}'

curl.exe -X POST http://localhost:3000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "x-api-key: local-dev-gateway-key" `
  -H "x-request-id: req_exact_second" `
  -d '{"model":"mock-model","messages":[{"role":"user","content":"Explain DNS simply"}]}'
```

Expected:

- First response: `x-cache-status: miss`
- Second response: `x-cache-status: hit-exact`
- Second response still has `requestId: req_exact_second`

Talking point: exact cache does not bypass governance; governance has already admitted the request.

## Semantic Cache Demo

Semantic cache is conservative and uses deterministic mock embeddings. Natural-language paraphrases may not reliably hit because the mock embedding provider is hash-based, not a real semantic model.

For a deterministic demonstration, run the targeted integration test:

```powershell
pnpm --filter @igp/gateway test -- tests/integration/chat-completions.test.ts -t "returns a conservative semantic cache hit after exact miss"
```

What it proves:

- exact cache misses first
- semantic eligibility passes
- controlled vectors meet the threshold
- provider execution is skipped on `hit-semantic`
- current `x-request-id` and response `requestId` are preserved

To enable the runtime semantic path locally:

```powershell
$env:CACHE_ENABLED="true"
$env:EMBEDDING_PROVIDER="mock"
$env:SEMANTIC_CACHE_ENABLED="true"
$env:SEMANTIC_CACHE_THRESHOLD="0.97"
$env:SEMANTIC_CACHE_MAX_CANDIDATES="10"
```

Expected `x-cache-status` values:

- `miss`: provider path was used after cache lookup
- `hit-exact`: exact cache returned a response
- `hit-semantic`: conservative semantic cache returned a safe response
- `bypass`: cache disabled or cache read failure fell open

## Governance Explanation

Governance runs before cache:

- API key auth and validation happen first.
- Redis governance applies abuse checks, rate limits, daily token quota, and monthly budget admission.
- Cache lookup runs only after governance admission.
- Redis unavailable fails closed with `503 governance_unavailable`.
- Cache unavailable fails open to provider execution after admission.

## Two-Minute Walkthrough

1. "This is a TypeScript inference gateway with authenticated chat completions."
2. "Requests go through auth, validation, Redis governance, cache, then provider execution."
3. "Governance fails closed because it controls cost and abuse. Cache fails open because it is only an optimization."
4. "Provider execution supports configured routing, timeout, retry, fallback, and local metrics."
5. "Exact cache is tenant-isolated and deterministic; Postgres can persist successful responses."
6. "Semantic cache is intentionally conservative: exact first, then policy checks, tenant/model compatibility, strict threshold, and fail-open behavior."
7. "Future systems like live providers, Kafka, OpenTelemetry, Kubernetes, and eval routing are documented but intentionally not implemented in this phase."
