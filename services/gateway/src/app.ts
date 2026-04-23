import { createServer, type Server } from "node:http";
import type { GatewayConfig } from "./config/index.js";
import type { ChatCompletionService } from "./chat/service.js";
import { createRequestContext, type RequestContext } from "./http/context.js";
import { isHttpError } from "./http/errors.js";
import type { Logger } from "./logging/logger.js";
import { routeRequest } from "./http/routes.js";
import { sendErrorResponse } from "./http/response.js";

export interface AppDependencies {
  readonly config: GatewayConfig;
  readonly logger: Logger;
  readonly chatCompletionService: ChatCompletionService;
}

export function createApp(dependencies: AppDependencies): Server {
  return createServer((request, response) => {
    const context = createRequestContext(request, response, dependencies);
    logRequestStarted(context);

    response.on("finish", () => {
      context.logger.info("request_completed", {
        durationMs: Date.now() - context.startedAt,
        statusCode: response.statusCode
      });
    });

    routeRequest(request, response, context).catch((error: unknown) => {
      const httpError = isHttpError(error)
        ? error
        : {
            statusCode: 500,
            code: "internal_server_error",
            message: "Internal server error.",
            headers: {}
          };

      if (httpError.statusCode >= 500 && httpError.code !== "provider_not_implemented") {
        context.logger.error("request_failed", {
          code: httpError.code,
          error: error instanceof Error ? error.message : httpError.message,
          statusCode: httpError.statusCode
        });
      } else {
        context.logger.warn("request_rejected", {
          code: httpError.code,
          message: httpError.message,
          statusCode: httpError.statusCode
        });
      }

      if (!response.writableEnded) {
        sendErrorResponse(
          response,
          context.requestId,
          httpError.statusCode,
          httpError.code,
          httpError.message,
          httpError.headers
        );
      }
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

function logRequestStarted(context: RequestContext): void {
  context.logger.info("request_started");
}
