import type { ChatCompletionRequest } from "../chat/types.js";
import type { ChatExecutionResult } from "../chat/service.js";
import type { CacheConfig } from "../config/index.js";
import type { EmbeddingService } from "../embeddings/embedding-service.js";
import { buildChatCompletionEmbeddingInput } from "../embeddings/embedding-input.js";
import type { Logger } from "../logging/logger.js";
import type { CacheMetrics } from "../metrics/cache-metrics.js";
import { createExactChatCacheKey, parseExactChatCacheKey } from "./key.js";
import type { CacheRepository } from "./repository.js";
import { cosineSimilarity } from "./similarity.js";
import { createSemanticInputHash, evaluateSemanticCacheEligibility } from "./semantic-policy.js";
import type { CachedSemanticMetadata, CacheStatus, SemanticCacheCandidate } from "./types.js";

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
  readonly embeddingService?: EmbeddingService;
  readonly now?: () => Date;
}

export function createCacheService(dependencies: CacheServiceDependencies): CacheService {
  return new ExactCacheService(dependencies);
}

class ExactCacheService implements CacheService {
  private readonly config: CacheConfig;
  private readonly metrics: CacheMetrics;
  private readonly repository: CacheRepository;
  private readonly embeddingService: EmbeddingService | undefined;
  private readonly now: () => Date;

  public constructor(dependencies: CacheServiceDependencies) {
    this.config = dependencies.config;
    this.metrics = dependencies.metrics;
    this.repository = dependencies.repository;
    this.embeddingService = dependencies.embeddingService;
    this.now = dependencies.now ?? (() => new Date());
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

    const semanticLookupResult = await this.readSemantic(cacheKey, request, context);

    if (semanticLookupResult.type === "hit") {
      this.metrics.recordSemanticHit();
      context.logger.info("cache_semantic_hit");

      return {
        completion: semanticLookupResult.completion,
        metadata: {
          provider: semanticLookupResult.completion.provider,
          fallbackUsed: false,
          retryCount: 0
        },
        cacheStatus: "hit-semantic"
      };
    }

    this.metrics.recordMiss();
    const executionResult = await createCompletion();
    await this.writeExact(cacheKey, executionResult, context, semanticLookupResult.semanticMetadata);

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
    context: CacheServiceContext,
    semanticMetadata: CachedSemanticMetadata | undefined
  ): Promise<void> {
    try {
      await this.repository.setExact(
        cacheKey,
        semanticMetadata
          ? {
              completion: executionResult.completion,
              semanticMetadata
            }
          : {
              completion: executionResult.completion
            }
      );
    } catch (error) {
      this.metrics.recordWriteError();
      context.logger.warn("cache_write_error", {
        error: error instanceof Error ? error.message : "Unknown cache write error"
      });
    }
  }

  private async readSemantic(
    cacheKey: string,
    request: ChatCompletionRequest,
    context: CacheServiceContext
  ): Promise<SemanticReadResult> {
    if (!this.config.semantic.enabled) {
      this.metrics.recordSemanticBypass();
      return {
        type: "bypass"
      };
    }

    if (!this.embeddingService) {
      this.metrics.recordSemanticBypass();
      context.logger.warn("cache_semantic_embedding_unavailable");
      return {
        type: "bypass"
      };
    }

    const eligibility = evaluateSemanticCacheEligibility(request);

    if (!eligibility.eligible) {
      this.metrics.recordSemanticRejected();
      context.logger.info("cache_semantic_rejected", {
        reason: eligibility.reason ?? "unknown"
      });
      return {
        type: "bypass"
      };
    }

    const keyParts = parseExactChatCacheKey(cacheKey);
    const embeddingInput = buildChatCompletionEmbeddingInput(request);
    const semanticInputHash = createSemanticInputHash(embeddingInput);
    let embedding: readonly number[];

    try {
      embedding = await this.embeddingService.createEmbedding(embeddingInput);
    } catch (error) {
      this.metrics.recordSemanticError();
      context.logger.warn("cache_semantic_embedding_error", {
        error: error instanceof Error ? error.message : "Unknown embedding error"
      });
      return {
        type: "error"
      };
    }

    if (!isValidEmbedding(embedding)) {
      this.metrics.recordSemanticError();
      context.logger.warn("cache_semantic_invalid_embedding");
      return {
        type: "error"
      };
    }

    const semanticMetadata: CachedSemanticMetadata = {
      tenantHash: keyParts.tenantHash,
      model: request.model,
      embedding,
      embeddingProvider: "mock",
      embeddingDimensions: embedding.length,
      semanticPolicyVersion: this.config.semantic.policyVersion,
      semanticInputHash,
      expiresAtMs: this.now().getTime() + this.config.ttlSeconds * 1_000,
      ...(eligibility.systemPromptHash ? { systemPromptHash: eligibility.systemPromptHash } : {})
    };

    let candidates: readonly SemanticCacheCandidate[];

    try {
      candidates = await this.repository.getSemanticCandidates({
        tenantHash: keyParts.tenantHash,
        model: request.model,
        embeddingProvider: semanticMetadata.embeddingProvider,
        embeddingDimensions: semanticMetadata.embeddingDimensions,
        semanticPolicyVersion: semanticMetadata.semanticPolicyVersion,
        maxCandidates: this.config.semantic.maxCandidates,
        ...(semanticMetadata.systemPromptHash ? { systemPromptHash: semanticMetadata.systemPromptHash } : {})
      });
    } catch (error) {
      this.metrics.recordReadError();
      this.metrics.recordSemanticError();
      context.logger.warn("cache_semantic_read_error", {
        error: error instanceof Error ? error.message : "Unknown semantic cache read error"
      });
      return {
        type: "error",
        semanticMetadata
      };
    }

    const candidate = selectBestSemanticCandidate(
      embedding,
      candidates,
      this.config.semantic.threshold
    );

    if (!candidate) {
      this.metrics.recordSemanticMiss();
      return {
        type: "miss",
        semanticMetadata
      };
    }

    return {
      type: "hit",
      completion: candidate.completion
    };
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

type SemanticReadResult =
  | {
      readonly type: "hit";
      readonly completion: ChatExecutionResult["completion"];
    }
  | {
      readonly type: "miss";
      readonly semanticMetadata: CachedSemanticMetadata;
    }
  | {
      readonly type: "bypass";
      readonly semanticMetadata?: undefined;
    }
  | {
      readonly type: "error";
      readonly semanticMetadata?: CachedSemanticMetadata;
    };

function selectBestSemanticCandidate(
  embedding: readonly number[],
  candidates: readonly SemanticCacheCandidate[],
  threshold: number
): SemanticCacheCandidate | undefined {
  let bestCandidate: SemanticCacheCandidate | undefined;
  let bestSimilarity = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(embedding, candidate.embedding);

    if (similarity === undefined || similarity < threshold || similarity <= bestSimilarity) {
      continue;
    }

    bestCandidate = candidate;
    bestSimilarity = similarity;
  }

  return bestCandidate;
}

function isValidEmbedding(embedding: readonly number[]): boolean {
  return embedding.length > 0 && embedding.every((value) => Number.isFinite(value));
}
