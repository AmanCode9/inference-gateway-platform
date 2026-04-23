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

describe("GET /health", () => {
  it("returns the gateway health status", async () => {
    const config = loadConfig({ LOG_LEVEL: "error", PORT: "3000" });
    server = createApp({ config, logger: createLogger(config) });

    await new Promise<void>((resolve) => {
      server?.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();

    if (!isAddressInfo(address)) {
      throw new Error("Expected server to listen on a TCP address.");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = (await response.json()) as {
      status?: string;
      service?: string;
      version?: string;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      service: "inference-gateway",
      version: "0.1.0"
    });
  });
});

function isAddressInfo(address: string | AddressInfo | null): address is AddressInfo {
  return typeof address === "object" && address !== null;
}
