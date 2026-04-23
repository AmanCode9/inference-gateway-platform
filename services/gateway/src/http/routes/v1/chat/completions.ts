import type { IncomingMessage, ServerResponse } from "node:http";
import type { ChatCompletionResponse } from "../../../../chat/types.js";
import { validateChatCompletionRequest } from "../../../../chat/validation.js";
import { readJsonBody, RequestBodyError } from "../../../body.js";
import type { RequestContext } from "../../../context.js";
import { HttpError, methodNotAllowed } from "../../../errors.js";
import { requireApiKey } from "../../../middleware/auth.js";
import { requireJsonContentType } from "../../../middleware/content-type.js";
import { sendJson } from "../../../response.js";

export async function handleChatCompletions(
  request: IncomingMessage,
  response: ServerResponse,
  context: RequestContext
): Promise<void> {
  if (request.method !== "POST") {
    throw methodNotAllowed(["POST"]);
  }

  requireApiKey(request, context.config);
  requireJsonContentType(request);

  const body = await readRequestBody(request, context.config.maxRequestBytes);
  const chatRequest = validateChatCompletionRequest(body);

  context.logger.info("chat_completion_requested", {
    model: chatRequest.model,
    messageCount: chatRequest.messages.length,
    provider: context.provider.name
  });

  const providerResponse = await context.provider.createChatCompletion(chatRequest, {
    requestId: context.requestId,
    logger: context.logger.child({
      component: "provider",
      provider: context.provider.name
    })
  });

  context.logger.info("chat_completion_succeeded", {
    model: providerResponse.model,
    provider: providerResponse.provider,
    choiceCount: providerResponse.choices.length
  });

  sendJson(response, 200, {
    ...providerResponse,
    requestId: context.requestId
  } satisfies ChatCompletionResponse);
}

async function readRequestBody(request: IncomingMessage, maxRequestBytes: number): Promise<unknown> {
  try {
    return await readJsonBody(request, maxRequestBytes);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      throw new HttpError(error.statusCode, error.code, error.message);
    }

    throw error;
  }
}
