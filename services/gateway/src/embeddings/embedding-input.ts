import type { ChatCompletionRequest } from "../chat/types.js";

export function buildChatCompletionEmbeddingInput(request: ChatCompletionRequest): string {
  return JSON.stringify({
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  });
}
