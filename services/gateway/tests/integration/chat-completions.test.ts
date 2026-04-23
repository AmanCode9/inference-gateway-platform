import { afterEach, describe, expect, it } from "vitest";
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
    expect(body.object).toBe("chat.completion");
    expect(typeof body.created).toBe("number");
    expect(body.choices?.[0]?.finishReason).toBe("stop");
    expect(body.choices?.[0]?.message?.role).toBe("assistant");
    expect(body.choices?.[0]?.message?.content).toContain("Hello from tests");
    expect(server.metrics().providerSelected.mock).toBe(1);
    expect(server.metrics().providerSuccess.mock).toBe(1);
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
    expect(body.error?.message).toContain("Milestone 2 stub");
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
