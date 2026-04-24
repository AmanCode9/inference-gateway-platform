import { createHash } from "node:crypto";
import type { ChatCompletionRequest } from "../chat/types.js";

export const GOVERNANCE_ADMISSION_DEDUPLICATION_TTL_MS = 24 * 60 * 60 * 1_000;

export function createChatCompletionAdmissionId(
  requestId: string,
  request: ChatCompletionRequest
): string {
  return `chat_completion:${requestId}:${fingerprintChatCompletionRequest(request)}`;
}

function fingerprintChatCompletionRequest(request: ChatCompletionRequest): string {
  const normalizedPayload = JSON.stringify({
    model: request.model,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  });

  return createHash("sha256").update(normalizedPayload).digest("hex");
}
