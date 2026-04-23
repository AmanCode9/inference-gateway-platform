import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createChatCompletionService } from "../../src/chat/service.js";
import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/config/index.js";
import { createLogger } from "../../src/logging/logger.js";
import { createProviderMetrics, type ProviderMetricsSnapshot } from "../../src/metrics/provider-metrics.js";
import { createProviderRegistry } from "../../src/providers/registry.js";

export interface TestServer {
  readonly url: (pathname: string) => string;
  readonly close: () => Promise<void>;
  readonly metrics: () => ProviderMetricsSnapshot;
}

export async function startTestServer(overrides: NodeJS.ProcessEnv = {}): Promise<TestServer> {
  const config = loadConfig(createEnv(overrides));
  const metrics = createProviderMetrics();
  const providerRegistry = createProviderRegistry(config.providerRegistry);
  const chatCompletionService = createChatCompletionService({
    metrics,
    providerRegistry,
    routing: config.routing
  });
  const server = createApp({
    config,
    logger: createLogger(config),
    chatCompletionService
  });

  await listen(server);

  const address = server.address();

  if (!isAddressInfo(address)) {
    throw new Error("Expected server to listen on a TCP address.");
  }

  return {
    url: (pathname: string) => `http://127.0.0.1:${address.port}${pathname}`,
    close: () => close(server),
    metrics: () => metrics.snapshot()
  };
}

function createEnv(overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    LOG_LEVEL: "error",
    PORT: "3000",
    GATEWAY_API_KEY: "test-gateway-key",
    PRIMARY_PROVIDER_KIND: "mock",
    PRIMARY_PROVIDER_ID: "mock",
    PRIMARY_MOCK_BEHAVIOR: "success",
    PRIMARY_MOCK_DELAY_MS: "0",
    PROVIDER_TIMEOUT_MS: "1000",
    PROVIDER_MAX_RETRIES: "1",
    PROVIDER_RETRY_BACKOFF_MS: "1",
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
