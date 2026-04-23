import type { IncomingMessage, ServerResponse } from "node:http";
import type { GatewayConfig } from "../config/index.js";
import { getHealthStatus } from "../health/health.js";
import type { Logger } from "../logging/logger.js";
import { handleChatCompletions } from "./routes/v1/chat/completions.js";
import { sendError, sendJson, sendMethodNotAllowed } from "./response.js";

export interface RouteContext {
  readonly config: GatewayConfig;
  readonly logger: Logger;
}

export async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: RouteContext
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (url.pathname === "/health") {
    if (request.method !== "GET") {
      sendMethodNotAllowed(response, ["GET"]);
      return;
    }

    sendJson(response, 200, getHealthStatus(context.config));
    return;
  }

  if (url.pathname === "/v1/chat/completions") {
    await handleChatCompletions(request, response, context);
    return;
  }

  sendError(response, 404, "not_found", "Route not found.");
}
