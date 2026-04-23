import type { ChatCompletionRequest, ChatMessage, ChatMessageRole } from "./types.js";
import { badRequest } from "../http/errors.js";

export function validateChatCompletionRequest(value: unknown): ChatCompletionRequest {
  if (!isRecord(value)) {
    throw badRequest("Request body must be a JSON object.");
  }

  const model = value["model"];
  const messages = value["messages"];

  if (typeof model !== "string" || model.trim().length === 0) {
    throw badRequest("model must be a non-empty string.");
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw badRequest("messages must be a non-empty array.");
  }

  const parsedMessages = messages.map(parseChatMessage);

  return {
    model: model.trim(),
    messages: parsedMessages
  };
}

function parseChatMessage(value: unknown): ChatMessage {
  if (!isRecord(value)) {
    throw badRequest("Each message must be a JSON object.");
  }

  const role = value["role"];
  const content = value["content"];

  if (!isChatMessageRole(role)) {
    throw badRequest("message.role must be one of system, user, or assistant.");
  }

  if (typeof content !== "string" || content.trim().length === 0) {
    throw badRequest("message.content must be a non-empty string.");
  }

  return {
    role,
    content: content.trim()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChatMessageRole(value: unknown): value is ChatMessageRole {
  return value === "system" || value === "user" || value === "assistant";
}
