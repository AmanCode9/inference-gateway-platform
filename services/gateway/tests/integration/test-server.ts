import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createChatCompletionService } from "../../src/chat/service.js";
import { createApp } from "../../src/app.js";
import { createInMemoryCacheRepository } from "../../src/cache/in-memory-repository.js";
import type { CacheRepository } from "../../src/cache/repository.js";
import { createCacheService } from "../../src/cache/service.js";
import { loadConfig } from "../../src/config/index.js";
import { createGovernanceService } from "../../src/governance/service.js";
import { createInMemoryGovernanceStore } from "../../src/governance/in-memory-store.js";
import type { GovernanceStore } from "../../src/governance/types.js";
import { createLogger } from "../../src/logging/logger.js";
import { createCacheMetrics, type CacheMetricsSnapshot } from "../../src/metrics/cache-metrics.js";
import { createProviderMetrics, type ProviderMetricsSnapshot } from "../../src/metrics/provider-metrics.js";
import { createProviderRegistry } from "../../src/providers/registry.js";

export interface TestServer {
  readonly url: (pathname: string) => string;
  readonly close: () => Promise<void>;
  readonly metrics: () => ProviderMetricsSnapshot;
  readonly cacheMetrics: () => CacheMetricsSnapshot;
}

export interface StartTestServerOptions {
  readonly governanceStore?: GovernanceStore;
  readonly cacheRepository?: CacheRepository;
}

export async function startTestServer(
  overrides: NodeJS.ProcessEnv = {},
  options: StartTestServerOptions = {}
): Promise<TestServer> {
  const config = loadConfig(createEnv(overrides));
  const governanceStore = options.governanceStore ?? createInMemoryGovernanceStore();
  const governanceService = createGovernanceService({
    config: config.governance,
    store: governanceStore
  });
  const cacheMetrics = createCacheMetrics();
  const cacheService = createCacheService({
    config: config.cache,
    metrics: cacheMetrics,
    repository: options.cacheRepository ?? createInMemoryCacheRepository()
  });
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
    cacheService,
    chatCompletionService,
    governanceService
  });

  await listen(server);

  const address = server.address();

  if (!isAddressInfo(address)) {
    throw new Error("Expected server to listen on a TCP address.");
  }

  return {
    url: (pathname: string) => `http://127.0.0.1:${address.port}${pathname}`,
    close: () => close(server, governanceStore),
    metrics: () => metrics.snapshot(),
    cacheMetrics: () => cacheMetrics.snapshot()
  };
}

function createEnv(overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    LOG_LEVEL: "error",
    PORT: "3000",
    GATEWAY_API_KEY: "test-gateway-key",
    REDIS_URL: "redis://localhost:6379",
    REDIS_KEY_PREFIX: "test-gateway",
    REDIS_CONNECT_TIMEOUT_MS: "1000",
    PRIMARY_PROVIDER_KIND: "mock",
    PRIMARY_PROVIDER_ID: "mock",
    PRIMARY_MOCK_BEHAVIOR: "success",
    PRIMARY_MOCK_DELAY_MS: "0",
    PROVIDER_TIMEOUT_MS: "1000",
    PROVIDER_MAX_RETRIES: "1",
    PROVIDER_RETRY_BACKOFF_MS: "1",
    RATE_LIMIT_MAX_REQUESTS: "100",
    RATE_LIMIT_WINDOW_SECONDS: "60",
    DAILY_TOKEN_QUOTA: "100000",
    MONTHLY_BUDGET_LIMIT_MINOR_UNITS: "100000",
    TOKEN_ESTIMATE_CHARS_PER_TOKEN: "4",
    TOKEN_COST_PER_1K_MINOR_UNITS: "25",
    ABUSE_MAX_MESSAGE_COUNT: "32",
    ABUSE_MAX_MESSAGE_CHARACTERS: "4000",
    ABUSE_MAX_TOTAL_MESSAGE_CHARACTERS: "12000",
    EXACT_CACHE_ENABLED: "false",
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

function close(server: Server, governanceStore: GovernanceStore): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(async (error) => {
      if (error) {
        reject(error);
        return;
      }

      try {
        await governanceStore.close();
        resolve();
      } catch (closeError) {
        reject(closeError);
      }
    });
  });
}
