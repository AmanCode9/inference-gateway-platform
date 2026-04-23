import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/config/index.js";
import { createLogger } from "../../src/logging/logger.js";
import { createProvider } from "../../src/providers/create-provider.js";

export interface TestServer {
  readonly url: (pathname: string) => string;
  readonly close: () => Promise<void>;
}

export async function startTestServer(overrides: NodeJS.ProcessEnv = {}): Promise<TestServer> {
  const config = loadConfig(createEnv(overrides));
  const provider = createProvider(config);
  const server = createApp({
    config,
    logger: createLogger(config),
    provider
  });

  await listen(server);

  const address = server.address();

  if (!isAddressInfo(address)) {
    throw new Error("Expected server to listen on a TCP address.");
  }

  return {
    url: (pathname: string) => `http://127.0.0.1:${address.port}${pathname}`,
    close: () => close(server)
  };
}

function createEnv(overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    LOG_LEVEL: "error",
    PORT: "3000",
    GATEWAY_API_KEY: "test-gateway-key",
    PROVIDER_KIND: "mock",
    ...overrides
  };
}

function isAddressInfo(address: string | AddressInfo | null): address is AddressInfo {
  return typeof address === "object" && address !== null;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
