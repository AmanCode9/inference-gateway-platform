import { createApp, startServer } from "./app.js";
import { loadConfig } from "./config/index.js";
import { createLogger } from "./logging/logger.js";

const config = loadConfig();
const logger = createLogger(config);
const server = createApp({ config, logger });

void startServer(server, config, logger).catch((error: unknown) => {
  logger.error("gateway_start_failed", {
    error: error instanceof Error ? error.message : "Unknown error"
  });
  process.exit(1);
});

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
