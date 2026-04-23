import type { IncomingMessage, ServerResponse } from "node:http";
import { getHealthStatus } from "../health/health.js";
import type { RequestContext } from "./context.js";
import { methodNotAllowed, notFound } from "./errors.js";
import { handleChatCompletions } from "./routes/v1/chat/completions.js";
import { sendJson } from "./response.js";

export async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: RequestContext
): Promise<void> {
  if (context.path === "/health") {
    if (request.method !== "GET") {
      throw methodNotAllowed(["GET"]);
    }

    sendJson(response, 200, getHealthStatus(context.config));
    return;
  }

  if (context.path === "/v1/chat/completions") {
    await handleChatCompletions(request, response, context);
    return;
  }

  throw notFound();
}
