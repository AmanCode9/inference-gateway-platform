import { randomUUID } from "node:crypto";
import type { MockProviderBehavior } from "../config/index.js";
import type { ChatCompletionRequest, ProviderChatCompletion } from "../chat/types.js";
import { ProviderError } from "./errors.js";
import type { ChatProvider, ProviderContext } from "./types.js";

export interface MockChatProviderConfig {
  readonly providerId: string;
  readonly behavior: MockProviderBehavior;
  readonly delayMs: number;
}

export class MockChatProvider implements ChatProvider {
  public readonly name: string;
  private readonly behavior: MockProviderBehavior;
  private readonly delayMs: number;
  private readonly attemptsByRequestId = new Map<string, number>();

  public constructor(config: MockChatProviderConfig) {
    this.name = config.providerId;
    this.behavior = config.behavior;
    this.delayMs = config.delayMs;
  }

  public async createChatCompletion(
    request: ChatCompletionRequest,
    context: ProviderContext
  ): Promise<ProviderChatCompletion> {
    const attempt = this.nextAttempt(context.requestId);
    let preserveAttemptState = false;

    try {
      await delay(resolveDelayMs(this.behavior, this.delayMs), context.signal);

      const lastUserMessage = [...request.messages].reverse().find((message) => message.role === "user");
      const content = lastUserMessage
        ? `Mock provider reply: ${lastUserMessage.content}`
        : "Mock provider reply.";

      if (this.behavior === "retryable_failure") {
        throw new ProviderError(503, "provider_unavailable", "Mock provider retryable failure.", true);
      }

      if (this.behavior === "non_retryable_failure") {
        throw new ProviderError(503, "provider_execution_failed", "Mock provider non-retryable failure.", false);
      }

      if (this.behavior === "flaky_once" && attempt === 1) {
        preserveAttemptState = true;
        throw new ProviderError(503, "provider_unavailable", "Mock provider retryable failure.", true);
      }

      context.logger.info("mock_provider_completed", {
        model: request.model,
        provider: this.name
      });

      return {
        id: `chatcmpl_${randomUUID()}`,
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
    } finally {
      if (!preserveAttemptState) {
        this.attemptsByRequestId.delete(context.requestId);
      }
    }
  }

  private nextAttempt(requestId: string): number {
    const nextAttempt = (this.attemptsByRequestId.get(requestId) ?? 0) + 1;
    this.attemptsByRequestId.set(requestId, nextAttempt);
    return nextAttempt;
  }
}

async function delay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs === 0) {
    if (signal.aborted) {
      throw signal.reason;
    }

    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    const onAbort = (): void => {
      cleanup();
      reject(signal.reason);
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    };

    signal.addEventListener("abort", onAbort, { once: true });

    if (signal.aborted) {
      onAbort();
    }
  });
}

function resolveDelayMs(behavior: MockProviderBehavior, configuredDelayMs: number): number {
  if (behavior === "timeout") {
    return configuredDelayMs > 0 ? configuredDelayMs : 5_000;
  }

  return configuredDelayMs;
}
