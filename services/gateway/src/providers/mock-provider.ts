import type { ChatCompletionRequest, ProviderChatCompletion } from "../chat/types.js";
import type { ChatProvider, ProviderContext } from "./types.js";

export class MockChatProvider implements ChatProvider {
  public readonly name = "mock";

  public async createChatCompletion(
    request: ChatCompletionRequest,
    context: ProviderContext
  ): Promise<ProviderChatCompletion> {
    const lastUserMessage = [...request.messages].reverse().find((message) => message.role === "user");
    const content = lastUserMessage
      ? `Mock provider reply: ${lastUserMessage.content}`
      : "Mock provider reply.";

    context.logger.info("mock_provider_completed", {
      model: request.model
    });

    return {
      id: `chatcmpl_${context.requestId}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1_000),
      model: request.model,
      provider: this.name,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content
          },
          finishReason: "stop"
        }
      ]
    };
  }
}
