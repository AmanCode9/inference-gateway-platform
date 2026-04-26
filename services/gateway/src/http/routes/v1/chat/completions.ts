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

  const apiKey = requireApiKey(request, context.config);
  requireJsonContentType(request);

  const body = await readRequestBody(request, context.config.maxRequestBytes);
  const chatRequest = validateChatCompletionRequest(body);
  const governanceResult = await context.governanceService.admitChatCompletion(chatRequest, {
    apiKey,
    requestId: context.requestId,
    logger: context.logger.child({
      component: "governance"
    })
  });

  context.logger.info("chat_completion_requested", {
    estimatedCostMinorUnits: governanceResult.usageEstimate.estimatedCostMinorUnits,
    estimatedTokens: governanceResult.usageEstimate.estimatedTokens,
    model: chatRequest.model,
    messageCount: chatRequest.messages.length
  });

  const executionResult = await context.cacheService.getOrCreateChatCompletion(
    chatRequest,
    {
      apiKey,
      logger: context.logger.child({
        component: "cache"
      })
    },
    () =>
      context.chatCompletionService.createChatCompletion(chatRequest, {
        requestId: context.requestId,
        logger: context.logger.child({
          component: "provider_execution"
        })
      })
  );

  context.logger.info("chat_completion_succeeded", {
    model: executionResult.completion.model,
    provider: executionResult.metadata.provider,
    choiceCount: executionResult.completion.choices.length,
    fallbackUsed: executionResult.metadata.fallbackUsed,
    retryCount: executionResult.metadata.retryCount,
    cacheStatus: executionResult.cacheStatus
  });

  sendJson(
    response,
    200,
    {
      ...executionResult.completion,
      requestId: context.requestId
    } satisfies ChatCompletionResponse,
    {
      "x-cache-status": executionResult.cacheStatus
    }
  );
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
