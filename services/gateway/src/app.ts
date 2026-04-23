import { createServer, type Server } from "node:http";
import type { GatewayConfig } from "./config/index.js";
import type { Logger } from "./logging/logger.js";
import { routeRequest } from "./http/routes.js";
import { sendError } from "./http/response.js";

export interface AppDependencies {
  readonly config: GatewayConfig;
  readonly logger: Logger;
}

export function createApp(dependencies: AppDependencies): Server {
  return createServer((request, response) => {
    routeRequest(request, response, dependencies).catch((error: unknown) => {
      dependencies.logger.error("unhandled_request_error", {
        error: error instanceof Error ? error.message : "Unknown error"
      });
      sendError(response, 500, "internal_server_error", "Internal server error.");
    });
  });
}

export function startServer(server: Server, config: GatewayConfig, logger: Logger): Promise<Server> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, () => {
      logger.info("gateway_started", {
        port: config.port,
        environment: config.nodeEnv
      });
      resolve(server);
    });
  });
}
