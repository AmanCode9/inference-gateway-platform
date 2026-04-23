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
  });

  it("returns 501 when the real provider stub is configured", async () => {
    server = await startTestServer({
      PROVIDER_KIND: "real_stub",
      REAL_PROVIDER_NAME: "openai",
      REAL_PROVIDER_BASE_URL: "https://api.openai.com/v1"
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
    expect(body.error?.message).toContain("Milestone 1 stub");
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
