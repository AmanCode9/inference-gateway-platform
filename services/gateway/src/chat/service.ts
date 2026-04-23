import type { ChatCompletionRequest, ProviderChatCompletion } from "./types.js";
import type { ProviderRoutingConfig } from "../config/index.js";
import { gatewayTimeout, serviceUnavailable, HttpError } from "../http/errors.js";
import type { Logger } from "../logging/logger.js";
import type { ProviderMetrics } from "../metrics/provider-metrics.js";
import { ProviderError, isAbortLikeError, isProviderError } from "../providers/errors.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { ChatProvider } from "../providers/types.js";

export interface ChatCompletionServiceContext {
  readonly requestId: string;
  readonly logger: Logger;
}

export interface ChatExecutionMetadata {
  readonly provider: string;
  readonly fallbackUsed: boolean;
  readonly retryCount: number;
}

export interface ChatExecutionResult {
  readonly completion: ProviderChatCompletion;
  readonly metadata: ChatExecutionMetadata;
}

export interface ChatCompletionService {
  createChatCompletion(
    request: ChatCompletionRequest,
    context: ChatCompletionServiceContext
  ): Promise<ChatExecutionResult>;
}

export interface ChatCompletionServiceDependencies {
  readonly providerRegistry: ProviderRegistry;
  readonly routing: ProviderRoutingConfig;
  readonly metrics: ProviderMetrics;
}

export function createChatCompletionService(
  dependencies: ChatCompletionServiceDependencies
): ChatCompletionService {
  return new RoutedChatCompletionService(dependencies);
}

class RoutedChatCompletionService implements ChatCompletionService {
  private readonly providerRegistry: ProviderRegistry;
  private readonly routing: ProviderRoutingConfig;
  private readonly metrics: ProviderMetrics;

  public constructor(dependencies: ChatCompletionServiceDependencies) {
    this.providerRegistry = dependencies.providerRegistry;
    this.routing = dependencies.routing;
    this.metrics = dependencies.metrics;
  }

  public async createChatCompletion(
    request: ChatCompletionRequest,
    context: ChatCompletionServiceContext
  ): Promise<ChatExecutionResult> {
    const deadline = Date.now() + this.routing.timeoutMs;
    const primaryProvider = this.providerRegistry.getProvider(this.routing.primaryProviderId);
    const primaryResult = await this.executeProvider(primaryProvider, request, context, deadline);

    if (primaryResult.type === "success") {
      return {
        completion: primaryResult.completion,
        metadata: {
          provider: primaryProvider.name,
          fallbackUsed: false,
          retryCount: primaryResult.retryCount
        }
      };
    }

    if (primaryResult.error.retryable && this.routing.secondaryProviderId) {
      if (deadline - Date.now() <= 0) {
        this.metrics.recordTimeout();
        throw toHttpError(createBudgetTimeoutError());
      }

      const secondaryProvider = this.providerRegistry.getProvider(this.routing.secondaryProviderId);
      this.metrics.recordFallback();
      context.logger.warn("provider_fallback_started", {
        fromProvider: primaryProvider.name,
        toProvider: secondaryProvider.name,
        reason: primaryResult.error.code
      });

      const secondaryResult = await this.executeProvider(secondaryProvider, request, context, deadline);

      if (secondaryResult.type === "success") {
        return {
          completion: secondaryResult.completion,
          metadata: {
            provider: secondaryProvider.name,
            fallbackUsed: true,
            retryCount: primaryResult.retryCount + secondaryResult.retryCount
          }
        };
      }

      throw toHttpError(secondaryResult.error);
    }

    throw toHttpError(primaryResult.error);
  }

  private async executeProvider(
    provider: ChatProvider,
    request: ChatCompletionRequest,
    context: ChatCompletionServiceContext,
    deadline: number
  ): Promise<ProviderAttemptResult> {
    let retryCount = 0;

    for (let attempt = 1; attempt <= this.routing.maxRetries + 1; attempt += 1) {
      const remainingMs = deadline - Date.now();

      if (remainingMs <= 0) {
        const timeoutError = createBudgetTimeoutError();
        this.metrics.recordTimeout();
        return {
          type: "failure",
          error: timeoutError,
          retryCount
        };
      }

      this.metrics.recordProviderSelected(provider.name);
      context.logger.info("provider_selected", {
        provider: provider.name,
        attempt,
        remainingMs
      });

      try {
        const completion = await runProviderAttempt(provider, request, context, remainingMs);
        this.metrics.recordProviderSuccess(provider.name);
        return {
          type: "success",
          completion,
          retryCount
        };
      } catch (error) {
        const providerError = classifyProviderError(provider.name, error);
        this.metrics.recordProviderFailure(provider.name);

        if (providerError.code === "provider_timeout") {
          this.metrics.recordTimeout();
        }

        context.logger.warn("provider_attempt_failed", {
          provider: provider.name,
          attempt,
          code: providerError.code,
          retryable: providerError.retryable,
          statusCode: providerError.statusCode
        });

        if (!providerError.retryable || attempt > this.routing.maxRetries) {
          return {
            type: "failure",
            error: providerError,
            retryCount
          };
        }

        const backoffMs = calculateBackoffMs(retryCount + 1, this.routing.retryBackoffMs);

        if (Date.now() + backoffMs >= deadline) {
          return {
            type: "failure",
            error: providerError,
            retryCount
          };
        }

        retryCount += 1;
        this.metrics.recordRetry();
        context.logger.warn("provider_retry_scheduled", {
          provider: provider.name,
          retryCount,
          backoffMs
        });
        await sleep(backoffMs);
      }
    }

    return {
      type: "failure",
      error: new ProviderError(503, "provider_unavailable", "Provider failed unexpectedly.", true),
      retryCount
    };
  }
}

type ProviderAttemptResult =
  | {
      readonly type: "success";
      readonly completion: ProviderChatCompletion;
      readonly retryCount: number;
    }
  | {
      readonly type: "failure";
      readonly error: ProviderError;
      readonly retryCount: number;
    };

async function runProviderAttempt(
  provider: ChatProvider,
  request: ChatCompletionRequest,
  context: ChatCompletionServiceContext,
  timeoutMs: number
): Promise<ProviderChatCompletion> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Provider execution timed out."));
  }, timeoutMs);

  try {
    return await provider.createChatCompletion(request, {
      requestId: context.requestId,
      logger: context.logger.child({
        component: "provider",
        provider: provider.name
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw createProviderTimeoutError(provider.name);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function classifyProviderError(providerName: string, error: unknown): ProviderError {
  if (isProviderError(error)) {
    return error;
  }

  if (error instanceof HttpError) {
    return new ProviderError(error.statusCode, error.code, error.message, false);
  }

  return new ProviderError(503, "provider_unavailable", `Provider "${providerName}" failed unexpectedly.`, true);
}

function toHttpError(error: ProviderError): HttpError {
  if (error.statusCode === 501) {
    return new HttpError(error.statusCode, error.code, error.message);
  }

  if (error.statusCode === 504 || error.code === "provider_timeout") {
    return gatewayTimeout(error.message, error.code);
  }

  return serviceUnavailable(error.message, error.code);
}

function createBudgetTimeoutError(): ProviderError {
  return new ProviderError(504, "provider_timeout", "The request exceeded the configured timeout budget.", false);
}

function createProviderTimeoutError(providerName: string): ProviderError {
  return new ProviderError(
    504,
    "provider_timeout",
    `Provider "${providerName}" exceeded the configured timeout budget.`,
    false
  );
}

function calculateBackoffMs(retryCount: number, retryBackoffMs: number): number {
  return retryCount * retryBackoffMs;
}

function sleep(delayMs: number): Promise<void> {
  if (delayMs === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
