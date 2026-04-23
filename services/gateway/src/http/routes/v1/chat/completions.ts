import type { IncomingMessage, ServerResponse } from "node:http";
import type { GatewayConfig } from "../../../../config/index.js";
import type { Logger } from "../../../../logging/logger.js";
import { readJsonBody, RequestBodyError } from "../../../body.js";
import { sendError, sendJson, sendMethodNotAllowed } from "../../../response.js";

interface ChatMessage {
  readonly role: string;
  readonly content: string;
}

interface ChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
}

type ValidationResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

interface RouteContext {
  readonly config: GatewayConfig;
  readonly logger: Logger;
}

export async function handleChatCompletions(
  request: IncomingMessage,
  response: ServerResponse,
  context: RouteContext
): Promise<void> {
  if (request.method !== "POST") {
    sendMethodNotAllowed(response, ["POST"]);
    return;
  }

  let body: unknown;

  try {
    body = await readJsonBody(request, context.config.maxRequestBytes);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      sendError(response, error.statusCode, error.code, error.message);
      return;
    }

    throw error;
  }

  const validation = validateChatCompletionRequest(body);

  if (!validation.ok) {
    sendError(response, 400, "invalid_request", validation.error);
    return;
  }

  context.logger.info("chat_completions_placeholder_requested", {
    messageCount: validation.value.messages.length
  });

  sendJson(response, 501, {
    error: {
      code: "not_implemented",
      message: "Chat completions routing is not implemented in Milestone 1."
    }
  });
}

function validateChatCompletionRequest(value: unknown): ValidationResult<ChatCompletionRequest> {
  if (!isRecord(value)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const model = value["model"];
  const messages = value["messages"];

  if (typeof model !== "string" || model.trim().length === 0) {
    return { ok: false, error: "model must be a non-empty string." };
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: "messages must be a non-empty array." };
  }

  const parsedMessages: ChatMessage[] = [];

  for (const message of messages) {
    const parsed = parseChatMessage(message);

    if (!parsed.ok) {
      return parsed;
    }

    parsedMessages.push(parsed.value);
  }

  const request: ChatCompletionRequest = {
    model: model.trim(),
    messages: parsedMessages
  };

  return { ok: true, value: request };
}

function parseChatMessage(value: unknown): ValidationResult<ChatMessage> {
  if (!isRecord(value)) {
    return { ok: false, error: "Each message must be a JSON object." };
  }

  const role = value["role"];
  const content = value["content"];

  if (typeof role !== "string" || role.trim().length === 0) {
    return { ok: false, error: "message.role must be a non-empty string." };
  }

  if (typeof content !== "string") {
    return { ok: false, error: "message.content must be a string." };
  }

  return {
    ok: true,
    value: {
      role: role.trim(),
      content
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
