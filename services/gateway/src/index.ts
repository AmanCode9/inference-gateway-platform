import { createApp, startServer } from "./app.js";
import { loadConfig } from "./config/index.js";
import { createLogger } from "./logging/logger.js";
import { createProvider } from "./providers/create-provider.js";

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
  const provider = createProvider(config);
  const server = createApp({ config, logger, provider });

  await startServer(server, config, logger);

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info("gateway_shutdown_requested", { signal });
    server.close((error) => {
      if (error) {
        logger.error("gateway_shutdown_failed", { error: error.message });
        process.exit(1);
      }

      logger.info("gateway_shutdown_complete");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
