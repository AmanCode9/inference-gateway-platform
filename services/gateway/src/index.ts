import { createChatCompletionService } from "./chat/service.js";
import { createApp, startServer } from "./app.js";
import { createInMemoryCacheRepository } from "./cache/in-memory-repository.js";
import { createCacheService } from "./cache/service.js";
import { loadConfig } from "./config/index.js";
import { createGovernanceService } from "./governance/service.js";
import { createRedisGovernanceStore } from "./governance/redis-store.js";
import { createLogger } from "./logging/logger.js";
import { createCacheMetrics } from "./metrics/cache-metrics.js";
import { createProviderMetrics } from "./metrics/provider-metrics.js";
import { createProviderRegistry } from "./providers/registry.js";
import { connectRedisClient } from "./redis/client.js";

void bootstrap().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "inference-gateway",
      message: "gateway_bootstrap_failed",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  );
  process.exit(1);
});

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const redisClient = await connectRedisClient(config.governance.redis);
  const governanceStore = createRedisGovernanceStore({
    client: redisClient,
    redis: config.governance.redis
  });
  const governanceService = createGovernanceService({
    config: config.governance,
    store: governanceStore
  });
  const cacheMetrics = createCacheMetrics();
  const cacheService = createCacheService({
    config: config.cache,
    metrics: cacheMetrics,
    repository: createInMemoryCacheRepository()
  });
  const metrics = createProviderMetrics();
  const providerRegistry = createProviderRegistry(config.providerRegistry);
  const chatCompletionService = createChatCompletionService({
    metrics,
    providerRegistry,
    routing: config.routing
  });
  const server = createApp({ config, logger, cacheService, chatCompletionService, governanceService });

  logger.info("redis_connected");

  await startServer(server, config, logger);

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info("gateway_shutdown_requested", { signal });
    server.close(async (error) => {
      if (error) {
        logger.error("gateway_shutdown_failed", { error: error.message });
        process.exit(1);
      }

      try {
        await governanceStore.close();
        logger.info("gateway_shutdown_complete");
        process.exit(0);
      } catch (closeError) {
        logger.error("gateway_shutdown_failed", {
          error: closeError instanceof Error ? closeError.message : "Unknown error"
        });
        process.exit(1);
      }
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
