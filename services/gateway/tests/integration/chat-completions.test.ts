import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/config/index.js";
import { createLogger } from "../../src/logging/logger.js";

let server: Server | undefined;

afterEach(async () => {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  server = undefined;
});

describe("POST /v1/chat/completions", () => {
  it("returns a not-implemented placeholder for a minimally valid request", async () => {
    const response = await postJson("/v1/chat/completions", {
      model: "placeholder-model",
      messages: [{ role: "user", content: "Hello" }]
    });

    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
      };
    };

    expect(response.status).toBe(501);
    expect(body).toMatchObject({
      error: {
        code: "not_implemented"
      }
    });
  });

  it("rejects requests that do not include the basic chat shape", async () => {
    const response = await postJson("/v1/chat/completions", {
      model: "",
      messages: []
    });

    const body = (await response.json()) as {
      error?: {
        code?: string;
      };
    };

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: "invalid_request"
      }
    });
  });
});

async function postJson(pathname: string, body: unknown): Promise<Response> {
  const config = loadConfig({ LOG_LEVEL: "error", PORT: "3000" });
  server = createApp({ config, logger: createLogger(config) });

  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();

  if (!isAddressInfo(address)) {
    throw new Error("Expected server to listen on a TCP address.");
  }

  return fetch(`http://127.0.0.1:${address.port}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function isAddressInfo(address: string | AddressInfo | null): address is AddressInfo {
  return typeof address === "object" && address !== null;
}
