import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryCacheRepository } from "../../src/cache/in-memory-repository.js";
import type { CacheRepository } from "../../src/cache/repository.js";
import type { CachedChatCompletion } from "../../src/cache/types.js";
import { createInMemoryGovernanceStore } from "../../src/governance/in-memory-store.js";
import { startTestServer, type TestServer } from "./test-server.js";

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("POST /v1/chat/completions", () => {
  it("returns 401 when the API key is missing", async () => {
    server = await startTestServer();

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "Hello" }]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: {
        code: "unauthorized"
      }
    });
    expect(body.error?.message).toBe("Missing or invalid API key.");
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("returns 401 when the API key is wrong", async () => {
    server = await startTestServer();

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "wrong-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "Hello" }]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: {
        code: "unauthorized"
      }
    });
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("returns 401 for duplicate x-api-key header values", async () => {
    server = await startTestServer();

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key, another-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "Hello" }]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: {
        code: "unauthorized",
        message: "Ambiguous x-api-key header values are not allowed."
      }
    });
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("returns 400 for invalid normalized payloads", async () => {
    server = await startTestServer();

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "tool", content: "" }]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: "invalid_request"
      }
    });
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("returns 400 for malformed JSON", async () => {
    server = await startTestServer();

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: "{\"model\":"
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: "invalid_json"
      }
    });
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("returns a mock chat completion and propagates request IDs", async () => {
    server = await startTestServer();

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key",
        "x-request-id": "req_integration_mock"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "Hello from tests" }]
      })
    });
    const body = (await response.json()) as {
      id?: string;
      object?: string;
      created?: number;
      requestId?: string;
      provider?: string;
      model?: string;
      choices?: Array<{
        finishReason?: string;
        message?: {
          role?: string;
          content?: string;
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req_integration_mock");
    expect(body).toMatchObject({
      requestId: "req_integration_mock",
      provider: "mock",
      model: "mock-model"
    });
    expect(body.id).toMatch(/^chatcmpl_/);
    expect(body.id).not.toContain("req_integration_mock");
    expect(body.object).toBe("chat.completion");
    expect(typeof body.created).toBe("number");
    expect(body.choices?.[0]?.finishReason).toBe("stop");
    expect(body.choices?.[0]?.message?.role).toBe("assistant");
    expect(body.choices?.[0]?.message?.content).toContain("Hello from tests");
    expect(server.metrics().providerSelected.mock).toBe(1);
    expect(server.metrics().providerSuccess.mock).toBe(1);
  });

  it("returns an exact cache hit for the same API key and normalized payload", async () => {
    server = await startTestServer({
      EXACT_CACHE_ENABLED: "true"
    });

    const requestBody = JSON.stringify({
      model: " mock-model ",
      messages: [{ role: "user", content: " cache me " }]
    });

    const firstResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key",
        "x-request-id": "req_cache_first"
      },
      body: requestBody
    });
    const secondResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key",
        "x-request-id": "req_cache_second"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "cache me" }]
      })
    });
    const secondBody = (await secondResponse.json()) as {
      id?: string;
      requestId?: string;
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get("x-cache-status")).toBe("miss");
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get("x-cache-status")).toBe("hit-exact");
    expect(secondResponse.headers.get("x-request-id")).toBe("req_cache_second");
    expect(secondBody.requestId).toBe("req_cache_second");
    expect(secondBody.id).toMatch(/^chatcmpl_/);
    expect(secondBody.id).not.toContain("req_cache_first");
    expect(secondBody.id).not.toContain("req_cache_second");
    expect(secondBody.choices?.[0]?.message?.content).toContain("cache me");
    expect(server.metrics().providerSelected.mock).toBe(1);
    expect(server.metrics().providerSuccess.mock).toBe(1);
    expect(server.cacheMetrics()).toMatchObject({
      exactHitCount: 1,
      missCount: 1
    });
  });

  it("does not share exact cache entries across API keys", async () => {
    const cacheRepository = createInMemoryCacheRepository();
    const requestBody = JSON.stringify({
      model: "mock-model",
      messages: [{ role: "user", content: "tenant isolated" }]
    });

    server = await startTestServer(
      {
        GATEWAY_API_KEY: "tenant-a-key",
        EXACT_CACHE_ENABLED: "true"
      },
      {
        cacheRepository
      }
    );

    const firstResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "tenant-a-key"
      },
      body: requestBody
    });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get("x-cache-status")).toBe("miss");
    expect(server.metrics().providerSelected.mock).toBe(1);

    await server.close();
    server = await startTestServer(
      {
        GATEWAY_API_KEY: "tenant-b-key",
        EXACT_CACHE_ENABLED: "true"
      },
      {
        cacheRepository
      }
    );

    const secondResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "tenant-b-key"
      },
      body: requestBody
    });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get("x-cache-status")).toBe("miss");
    expect(server.metrics().providerSelected.mock).toBe(1);
  });

  it("does not use exact cache to bypass governance rejection", async () => {
    server = await startTestServer({
      EXACT_CACHE_ENABLED: "true",
      RATE_LIMIT_MAX_REQUESTS: "1",
      RATE_LIMIT_WINDOW_SECONDS: "60"
    });

    const requestBody = JSON.stringify({
      model: "mock-model",
      messages: [{ role: "user", content: "governance still applies" }]
    });

    const firstResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key",
        "x-request-id": "req_cache_governance_first"
      },
      body: requestBody
    });
    const secondResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key",
        "x-request-id": "req_cache_governance_second"
      },
      body: requestBody
    });
    const secondBody = (await secondResponse.json()) as {
      error?: {
        code?: string;
      };
    };

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get("x-cache-status")).toBe("miss");
    expect(secondResponse.status).toBe(429);
    expect(secondBody.error?.code).toBe("rate_limit_exceeded");
    expect(secondResponse.headers.get("x-cache-status")).toBeNull();
    expect(server.metrics().providerSelected.mock).toBe(1);
    expect(server.cacheMetrics()).toMatchObject({
      exactHitCount: 0,
      missCount: 1
    });
  });

  it("rejects invalid API keys before cache lookup", async () => {
    const cacheRepository = new RecordingCacheRepository({
      failOnRead: true,
      failOnWrite: true
    });
    server = await startTestServer(
      {
        EXACT_CACHE_ENABLED: "true"
      },
      {
        cacheRepository
      }
    );

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "wrong-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "do not cache" }]
      })
    });

    expect(response.status).toBe(401);
    expect(cacheRepository.readCount).toBe(0);
    expect(cacheRepository.writeCount).toBe(0);
    expect(server.metrics().providerSelected.mock).toBeUndefined();
  });

  it("rejects governance failures before cache lookup", async () => {
    const cacheRepository = new RecordingCacheRepository({
      failOnRead: true,
      failOnWrite: true
    });
    server = await startTestServer(
      {
        DAILY_TOKEN_QUOTA: "1",
        TOKEN_ESTIMATE_CHARS_PER_TOKEN: "1",
        EXACT_CACHE_ENABLED: "true"
      },
      {
        cacheRepository
      }
    );

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "m",
        messages: [{ role: "user", content: "too many tokens" }]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
      };
    };

    expect(response.status).toBe(429);
    expect(body.error?.code).toBe("daily_token_quota_exceeded");
    expect(cacheRepository.readCount).toBe(0);
    expect(cacheRepository.writeCount).toBe(0);
    expect(server.metrics().providerSelected.mock).toBeUndefined();
  });

  it("fails open when exact cache read fails", async () => {
    const cacheRepository = new RecordingCacheRepository({
      failOnRead: true
    });
    server = await startTestServer(
      {
        EXACT_CACHE_ENABLED: "true"
      },
      {
        cacheRepository
      }
    );

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "read failure" }]
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cache-status")).toBe("bypass");
    expect(cacheRepository.readCount).toBe(1);
    expect(cacheRepository.writeCount).toBe(0);
    expect(server.metrics().providerSelected.mock).toBe(1);
    expect(server.cacheMetrics()).toMatchObject({
      bypassCount: 1,
      readErrorCount: 1
    });
  });

  it("fails open when exact cache write fails", async () => {
    const cacheRepository = new RecordingCacheRepository({
      failOnWrite: true
    });
    server = await startTestServer(
      {
        EXACT_CACHE_ENABLED: "true"
      },
      {
        cacheRepository
      }
    );

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "write failure" }]
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cache-status")).toBe("miss");
    expect(cacheRepository.readCount).toBe(1);
    expect(cacheRepository.writeCount).toBe(1);
    expect(server.metrics().providerSelected.mock).toBe(1);
    expect(server.cacheMetrics()).toMatchObject({
      missCount: 1,
      writeErrorCount: 1
    });
  });

  it("bypasses exact cache when it is disabled", async () => {
    server = await startTestServer({
      EXACT_CACHE_ENABLED: "false"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "disabled cache" }]
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cache-status")).toBe("bypass");
    expect(server.metrics().providerSelected.mock).toBe(1);
    expect(server.cacheMetrics().bypassCount).toBe(1);
  });

  it("keeps same x-request-id and same normalized payload idempotent for governance", async () => {
    server = await startTestServer({
      RATE_LIMIT_MAX_REQUESTS: "1",
      RATE_LIMIT_WINDOW_SECONDS: "60"
    });

    const firstResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key",
        "x-request-id": "req_same_governance_payload"
      },
      body: JSON.stringify({
        model: " mock-model ",
        messages: [{ role: "user", content: "safe retry" }]
      })
    });
    const retryResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key",
        "x-request-id": "req_same_governance_payload"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: " safe retry " }]
      })
    });
    const distinctResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key",
        "x-request-id": "req_distinct_after_retry"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "safe retry" }]
      })
    });
    const distinctBody = (await distinctResponse.json()) as {
      error?: {
        code?: string;
        requestId?: string;
      };
    };

    expect(firstResponse.status).toBe(200);
    expect(retryResponse.status).toBe(200);
    expect(firstResponse.headers.get("x-request-id")).toBe("req_same_governance_payload");
    expect(retryResponse.headers.get("x-request-id")).toBe("req_same_governance_payload");
    expect(distinctResponse.status).toBe(429);
    expect(distinctBody.error?.code).toBe("rate_limit_exceeded");
    expect(distinctBody.error?.requestId).toBe("req_distinct_after_retry");
    expect(server.metrics().providerSelected.mock).toBe(2);
  });

  it("governs the same x-request-id with a different normalized payload as distinct", async () => {
    server = await startTestServer({
      RATE_LIMIT_MAX_REQUESTS: "1",
      RATE_LIMIT_WINDOW_SECONDS: "60"
    });

    const firstResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key",
        "x-request-id": "req_reused_for_distinct_payload"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "first payload" }]
      })
    });
    const secondResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key",
        "x-request-id": "req_reused_for_distinct_payload"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "second payload" }]
      })
    });
    const secondBody = (await secondResponse.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(429);
    expect(secondBody.error?.code).toBe("rate_limit_exceeded");
    expect(secondBody.error?.message).toBe("Rate limit exceeded.");
    expect(secondBody.error?.requestId).toBe("req_reused_for_distinct_payload");
    expect(Number(secondResponse.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(server.metrics().providerSelected.mock).toBe(1);
  });

  it("returns 429 when the per-key rate limit is exceeded", async () => {
    server = await startTestServer({
      RATE_LIMIT_MAX_REQUESTS: "2",
      RATE_LIMIT_WINDOW_SECONDS: "60"
    });

    const requestBody = JSON.stringify({
      model: "mock-model",
      messages: [{ role: "user", content: "rate limit please" }]
    });

    const firstResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const secondResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const thirdResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const thirdBody = (await thirdResponse.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(thirdResponse.status).toBe(429);
    expect(thirdBody.error?.code).toBe("rate_limit_exceeded");
    expect(thirdBody.error?.message).toBe("Rate limit exceeded.");
    expect(thirdBody.error?.requestId).toBe(thirdResponse.headers.get("x-request-id"));
    expect(Number(thirdResponse.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(server.metrics().providerSelected.mock).toBe(2);
  });

  it("counts only fully admitted requests toward the rate limit", async () => {
    server = await startTestServer({
      RATE_LIMIT_MAX_REQUESTS: "1",
      RATE_LIMIT_WINDOW_SECONDS: "60"
    });

    const invalidResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "tool", content: "invalid" }]
      })
    });
    const firstValidResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "first admitted request" }]
      })
    });
    const secondValidResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "second admitted request" }]
      })
    });
    const secondValidBody = (await secondValidResponse.json()) as {
      error?: {
        code?: string;
      };
    };

    expect(invalidResponse.status).toBe(400);
    expect(firstValidResponse.status).toBe(200);
    expect(secondValidResponse.status).toBe(429);
    expect(secondValidBody.error?.code).toBe("rate_limit_exceeded");
    expect(server.metrics().providerSelected.mock).toBe(1);
  });

  it("retries retryable provider failures with backoff", async () => {
    server = await startTestServer({
      PRIMARY_MOCK_BEHAVIOR: "flaky_once",
      PROVIDER_MAX_RETRIES: "1",
      PROVIDER_RETRY_BACKOFF_MS: "1"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "retry please" }]
      })
    });

    const metrics = server.metrics();

    expect(response.status).toBe(200);
    expect(metrics.retryCount).toBe(1);
    expect(metrics.providerSelected.mock).toBe(2);
    expect(metrics.providerFailure.mock).toBe(1);
    expect(metrics.providerSuccess.mock).toBe(1);
  });

  it("falls back to a secondary provider after retryable primary failure", async () => {
    server = await startTestServer({
      PRIMARY_PROVIDER_ID: "mock-primary",
      PRIMARY_MOCK_BEHAVIOR: "retryable_failure",
      PROVIDER_MAX_RETRIES: "0",
      SECONDARY_PROVIDER_KIND: "mock",
      SECONDARY_PROVIDER_ID: "mock-secondary",
      SECONDARY_MOCK_BEHAVIOR: "success"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "fallback please" }]
      })
    });
    const body = (await response.json()) as {
      provider?: string;
    };
    const metrics = server.metrics();

    expect(response.status).toBe(200);
    expect(body.provider).toBe("mock-secondary");
    expect(metrics.fallbackCount).toBe(1);
    expect(metrics.providerFailure["mock-primary"]).toBe(1);
    expect(metrics.providerSuccess["mock-secondary"]).toBe(1);
  });

  it("falls back when another primary retry would exceed the remaining budget", async () => {
    server = await startTestServer({
      PRIMARY_PROVIDER_ID: "mock-primary",
      PRIMARY_MOCK_BEHAVIOR: "retryable_failure",
      PROVIDER_TIMEOUT_MS: "100",
      PROVIDER_MAX_RETRIES: "1",
      PROVIDER_RETRY_BACKOFF_MS: "100",
      SECONDARY_PROVIDER_KIND: "mock",
      SECONDARY_PROVIDER_ID: "mock-secondary",
      SECONDARY_MOCK_BEHAVIOR: "success"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "use fallback instead of retry" }]
      })
    });
    const body = (await response.json()) as {
      provider?: string;
    };
    const metrics = server.metrics();

    expect(response.status).toBe(200);
    expect(body.provider).toBe("mock-secondary");
    expect(metrics.retryCount).toBe(0);
    expect(metrics.fallbackCount).toBe(1);
    expect(metrics.timeoutCount).toBe(0);
    expect(metrics.providerSelected["mock-primary"]).toBe(1);
    expect(metrics.providerSelected["mock-secondary"]).toBe(1);
  });

  it("does not retry or fall back on non-retryable provider failures", async () => {
    server = await startTestServer({
      PRIMARY_PROVIDER_ID: "mock-primary",
      PRIMARY_MOCK_BEHAVIOR: "non_retryable_failure",
      PROVIDER_MAX_RETRIES: "2",
      SECONDARY_PROVIDER_KIND: "mock",
      SECONDARY_PROVIDER_ID: "mock-secondary",
      SECONDARY_MOCK_BEHAVIOR: "success"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "no retry" }]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
      };
    };
    const metrics = server.metrics();

    expect(response.status).toBe(503);
    expect(body.error?.code).toBe("provider_execution_failed");
    expect(metrics.retryCount).toBe(0);
    expect(metrics.fallbackCount).toBe(0);
    expect(metrics.providerSelected["mock-primary"]).toBe(1);
    expect(metrics.providerFailure["mock-primary"]).toBe(1);
    expect(metrics.providerSuccess["mock-secondary"]).toBeUndefined();
  });

  it("enforces the daily token quota with a deterministic request estimate", async () => {
    server = await startTestServer({
      DAILY_TOKEN_QUOTA: "5",
      TOKEN_ESTIMATE_CHARS_PER_TOKEN: "1",
      TOKEN_COST_PER_1K_MINOR_UNITS: "1000"
    });

    const requestBody = JSON.stringify({
      model: "m",
      messages: [{ role: "user", content: "abcd" }]
    });

    const firstResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const secondResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const secondBody = (await secondResponse.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(429);
    expect(secondBody.error?.code).toBe("daily_token_quota_exceeded");
    expect(secondBody.error?.message).toBe("Daily token quota exceeded.");
    expect(secondBody.error?.requestId).toBe(secondResponse.headers.get("x-request-id"));
    expect(server.metrics().providerSelected.mock).toBe(1);
  });

  it("charges quota on admission even when provider execution later fails", async () => {
    server = await startTestServer({
      DAILY_TOKEN_QUOTA: "5",
      TOKEN_ESTIMATE_CHARS_PER_TOKEN: "1",
      PRIMARY_PROVIDER_ID: "mock-primary",
      PRIMARY_MOCK_BEHAVIOR: "retryable_failure",
      PROVIDER_MAX_RETRIES: "0"
    });

    const requestBody = JSON.stringify({
      model: "m",
      messages: [{ role: "user", content: "abcd" }]
    });

    const firstResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const secondResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const firstBody = (await firstResponse.json()) as {
      error?: {
        code?: string;
      };
    };
    const secondBody = (await secondResponse.json()) as {
      error?: {
        code?: string;
      };
    };

    expect(firstResponse.status).toBe(503);
    expect(firstBody.error?.code).toBe("provider_unavailable");
    expect(secondResponse.status).toBe(429);
    expect(secondBody.error?.code).toBe("daily_token_quota_exceeded");
    expect(server.metrics().providerSelected["mock-primary"]).toBe(1);
  });

  it("does not double-count quota usage when fallback is used", async () => {
    server = await startTestServer({
      DAILY_TOKEN_QUOTA: "10",
      MONTHLY_BUDGET_LIMIT_MINOR_UNITS: "10",
      TOKEN_ESTIMATE_CHARS_PER_TOKEN: "1",
      TOKEN_COST_PER_1K_MINOR_UNITS: "1000",
      PRIMARY_PROVIDER_ID: "mock-primary",
      PRIMARY_MOCK_BEHAVIOR: "retryable_failure",
      PROVIDER_MAX_RETRIES: "0",
      SECONDARY_PROVIDER_KIND: "mock",
      SECONDARY_PROVIDER_ID: "mock-secondary",
      SECONDARY_MOCK_BEHAVIOR: "success"
    });

    const requestBody = JSON.stringify({
      model: "m",
      messages: [{ role: "user", content: "abcd" }]
    });

    const firstResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const secondResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const thirdResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const thirdBody = (await thirdResponse.json()) as {
      error?: {
        code?: string;
      };
    };

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(thirdResponse.status).toBe(429);
    expect(thirdBody.error?.code).toBe("daily_token_quota_exceeded");
  });

  it("enforces the monthly budget with deterministic minor-unit accounting", async () => {
    server = await startTestServer({
      DAILY_TOKEN_QUOTA: "50",
      MONTHLY_BUDGET_LIMIT_MINOR_UNITS: "5",
      TOKEN_ESTIMATE_CHARS_PER_TOKEN: "1",
      TOKEN_COST_PER_1K_MINOR_UNITS: "1000"
    });

    const requestBody = JSON.stringify({
      model: "m",
      messages: [{ role: "user", content: "abcd" }]
    });

    const firstResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const secondResponse = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: requestBody
    });
    const secondBody = (await secondResponse.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(429);
    expect(secondBody.error?.code).toBe("monthly_budget_exceeded");
    expect(secondBody.error?.message).toBe("Monthly budget exceeded.");
    expect(secondBody.error?.requestId).toBe(secondResponse.headers.get("x-request-id"));
    expect(server.metrics().providerSelected.mock).toBe(1);
  });

  it("returns 503 when both primary and fallback providers fail retryably", async () => {
    server = await startTestServer({
      PRIMARY_PROVIDER_ID: "mock-primary",
      PRIMARY_MOCK_BEHAVIOR: "retryable_failure",
      PROVIDER_MAX_RETRIES: "0",
      SECONDARY_PROVIDER_KIND: "mock",
      SECONDARY_PROVIDER_ID: "mock-secondary",
      SECONDARY_MOCK_BEHAVIOR: "retryable_failure"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "both providers fail" }]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };
    const metrics = server.metrics();

    expect(response.status).toBe(503);
    expect(body.error?.code).toBe("provider_unavailable");
    expect(body.error?.message).toBe("Mock provider retryable failure.");
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
    expect(metrics.retryCount).toBe(0);
    expect(metrics.fallbackCount).toBe(1);
    expect(metrics.timeoutCount).toBe(0);
    expect(metrics.providerFailure["mock-primary"]).toBe(1);
    expect(metrics.providerFailure["mock-secondary"]).toBe(1);
  });

  it("returns 504 when the provider exceeds the timeout budget", async () => {
    server = await startTestServer({
      PRIMARY_MOCK_BEHAVIOR: "timeout",
      PRIMARY_MOCK_DELAY_MS: "50",
      PROVIDER_TIMEOUT_MS: "10",
      PROVIDER_MAX_RETRIES: "0"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "timeout please" }]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };
    const metrics = server.metrics();

    expect(response.status).toBe(504);
    expect(body.error?.code).toBe("provider_timeout");
    expect(body.error?.message).toBe('Provider "mock" exceeded the configured timeout budget.');
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
    expect(metrics.timeoutCount).toBe(1);
    expect(metrics.providerFailure.mock).toBe(1);
  });

  it("returns 400 when the message count exceeds the abuse limit", async () => {
    server = await startTestServer({
      ABUSE_MAX_MESSAGE_COUNT: "1"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [
          { role: "user", content: "first" },
          { role: "assistant", content: "second" }
        ]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("invalid_request");
    expect(body.error?.message).toBe("messages must contain at most 1 items.");
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
    expect(server.metrics().providerSelected.mock).toBeUndefined();
  });

  it("returns 400 when a single message exceeds the abuse content limit", async () => {
    server = await startTestServer({
      ABUSE_MAX_MESSAGE_CHARACTERS: "3",
      ABUSE_MAX_TOTAL_MESSAGE_CHARACTERS: "10"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "four" }]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("invalid_request");
    expect(body.error?.message).toBe("message.content must contain at most 3 characters.");
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("returns 400 when total message content exceeds the abuse limit", async () => {
    server = await startTestServer({
      ABUSE_MAX_MESSAGE_CHARACTERS: "5",
      ABUSE_MAX_TOTAL_MESSAGE_CHARACTERS: "5"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [
          { role: "user", content: "abc" },
          { role: "assistant", content: "def" }
        ]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("invalid_request");
    expect(body.error?.message).toBe("messages content must contain at most 5 characters in total.");
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("returns 503 when the governance store is unavailable", async () => {
    server = await startTestServer(
      {},
      {
        governanceStore: createInMemoryGovernanceStore({
          unavailable: true
        })
      }
    );

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "redis down" }]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(503);
    expect(body.error?.code).toBe("governance_unavailable");
    expect(body.error?.message).toBe("Usage governance is temporarily unavailable.");
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
    expect(server.metrics().providerSelected.mock).toBeUndefined();
  });

  it("returns 413 when the request body exceeds the configured size limit", async () => {
    server = await startTestServer({
      MAX_REQUEST_BYTES: "20"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: "this body is intentionally too large" }]
      })
    });
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(413);
    expect(body.error?.code).toBe("request_too_large");
    expect(body.error?.message).toBe("Request body is too large.");
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
    expect(server.metrics().providerSelected.mock).toBeUndefined();
  });

  it("returns 501 when the real provider stub is configured", async () => {
    server = await startTestServer({
      PRIMARY_PROVIDER_KIND: "real_stub",
      PRIMARY_PROVIDER_ID: "openai-stub",
      PRIMARY_REAL_PROVIDER_NAME: "openai",
      PRIMARY_REAL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
    });

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-gateway-key"
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [{ role: "user", content: "Hello" }]
      })
    });

    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(501);
    expect(body).toMatchObject({
      error: {
        code: "provider_not_implemented"
      }
    });
    expect(body.error?.message).toContain("Milestone 3 stub");
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("returns 415 when content type is not JSON", async () => {
    server = await startTestServer();

    const response = await fetch(server.url("/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-api-key": "test-gateway-key"
      },
      body: "not json"
    });

    const body = (await response.json()) as {
      error?: {
        code?: string;
        requestId?: string;
      };
    };

    expect(response.status).toBe(415);
    expect(body).toMatchObject({
      error: {
        code: "unsupported_media_type"
      }
    });
    expect(body.error?.requestId).toBe(response.headers.get("x-request-id"));
  });
});

class RecordingCacheRepository implements CacheRepository {
  public readCount = 0;
  public writeCount = 0;
  private readonly failOnRead: boolean;
  private readonly failOnWrite: boolean;
  private readonly entries = new Map<string, CachedChatCompletion>();

  public constructor(options: { readonly failOnRead?: boolean; readonly failOnWrite?: boolean } = {}) {
    this.failOnRead = options.failOnRead ?? false;
    this.failOnWrite = options.failOnWrite ?? false;
  }

  public async getExact(cacheKey: string): Promise<CachedChatCompletion | undefined> {
    this.readCount += 1;

    if (this.failOnRead) {
      throw new Error("Simulated cache read failure.");
    }

    return this.entries.get(cacheKey);
  }

  public async setExact(cacheKey: string, entry: CachedChatCompletion): Promise<void> {
    this.writeCount += 1;

    if (this.failOnWrite) {
      throw new Error("Simulated cache write failure.");
    }

    this.entries.set(cacheKey, entry);
  }
}
