import type { ChatCompletionRequest, ProviderChatCompletion } from "../chat/types.js";
import type { Logger } from "../logging/logger.js";

export interface ProviderContext {
  readonly requestId: string;
  readonly logger: Logger;
}

export interface ChatProvider {
  readonly name: string;
  createChatCompletion(
    request: ChatCompletionRequest,
    context: ProviderContext
  ): Promise<ProviderChatCompletion>;
}
