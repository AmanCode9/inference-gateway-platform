import type { ChatCompletionRequest } from "../chat/types.js";
import type { ChatExecutionResult } from "../chat/service.js";
import type { CacheConfig } from "../config/index.js";
import type { Logger } from "../logging/logger.js";
import type { CacheMetrics } from "../metrics/cache-metrics.js";
import { createExactChatCacheKey } from "./key.js";
import type { CacheRepository } from "./repository.js";
import type { CacheStatus } from "./types.js";

export interface CacheServiceContext {
  readonly apiKey: string;
  readonly logger: Logger;
}

export interface CachedChatExecutionResult extends ChatExecutionResult {
  readonly cacheStatus: CacheStatus;
}

export interface CacheService {
  getOrCreateChatCompletion(
    request: ChatCompletionRequest,
    context: CacheServiceContext,
    createCompletion: () => Promise<ChatExecutionResult>
  ): Promise<CachedChatExecutionResult>;
}

export interface CacheServiceDependencies {
  readonly config: CacheConfig;
  readonly metrics: CacheMetrics;
  readonly repository: CacheRepository;
}

export function createCacheService(dependencies: CacheServiceDependencies): CacheService {
  return new ExactCacheService(dependencies);
}

class ExactCacheService implements CacheService {
  private readonly config: CacheConfig;
  private readonly metrics: CacheMetrics;
  private readonly repository: CacheRepository;

  public constructor(dependencies: CacheServiceDependencies) {
    this.config = dependencies.config;
    this.metrics = dependencies.metrics;
    this.repository = dependencies.repository;
  }

  public async getOrCreateChatCompletion(
    request: ChatCompletionRequest,
    context: CacheServiceContext,
    createCompletion: () => Promise<ChatExecutionResult>
  ): Promise<CachedChatExecutionResult> {
    if (!this.config.exactEnabled) {
      this.metrics.recordBypass();
      const executionResult = await createCompletion();

      return {
        ...executionResult,
        cacheStatus: "bypass"
      };
    }

    const cacheKey = createExactChatCacheKey({
      apiKey: context.apiKey,
      request
    });

    const cachedEntry = await this.readExact(cacheKey, context);

    if (cachedEntry.type === "hit") {
      this.metrics.recordExactHit();
      context.logger.info("cache_exact_hit");

      return {
        completion: cachedEntry.executionResult.completion,
        metadata: {
          provider: cachedEntry.executionResult.completion.provider,
          fallbackUsed: false,
          retryCount: 0
        },
        cacheStatus: "hit-exact"
      };
    }

    if (cachedEntry.type === "read_error") {
      this.metrics.recordReadError();
      this.metrics.recordBypass();
      context.logger.warn("cache_read_failed");
      const executionResult = await createCompletion();

      return {
        ...executionResult,
        cacheStatus: "bypass"
      };
    }

    this.metrics.recordMiss();
    const executionResult = await createCompletion();
    await this.writeExact(cacheKey, executionResult, context);

    return {
      ...executionResult,
      cacheStatus: "miss"
    };
  }

  private async readExact(
    cacheKey: string,
    context: CacheServiceContext
  ): Promise<CacheReadResult> {
    try {
      const cachedEntry = await this.repository.getExact(cacheKey);

      if (!cachedEntry) {
        return {
          type: "miss"
        };
      }

      return {
        type: "hit",
        executionResult: {
          completion: cachedEntry.completion,
          metadata: {
            provider: cachedEntry.completion.provider,
            fallbackUsed: false,
            retryCount: 0
          }
        }
      };
    } catch (error) {
      context.logger.warn("cache_read_error", {
        error: error instanceof Error ? error.message : "Unknown cache read error"
      });

      return {
        type: "read_error"
      };
    }
  }

  private async writeExact(
    cacheKey: string,
    executionResult: ChatExecutionResult,
    context: CacheServiceContext
  ): Promise<void> {
    try {
      await this.repository.setExact(cacheKey, {
        completion: executionResult.completion
      });
    } catch (error) {
      this.metrics.recordWriteError();
      context.logger.warn("cache_write_error", {
        error: error instanceof Error ? error.message : "Unknown cache write error"
      });
    }
  }
}

type CacheReadResult =
  | {
      readonly type: "hit";
      readonly executionResult: ChatExecutionResult;
    }
  | {
      readonly type: "miss";
    }
  | {
      readonly type: "read_error";
    };
