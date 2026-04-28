import type { ProviderChatCompletion } from "../chat/types.js";

export type CacheStatus = "miss" | "hit-exact" | "hit-semantic" | "bypass";

export interface CachedChatCompletion {
  readonly completion: ProviderChatCompletion;
  readonly semanticMetadata?: CachedSemanticMetadata;
}

export interface CachedSemanticMetadata {
  readonly tenantHash: string;
  readonly model: string;
  readonly embedding: readonly number[];
  readonly embeddingProvider: string;
  readonly embeddingDimensions: number;
  readonly semanticPolicyVersion: string;
  readonly semanticInputHash: string;
  readonly systemPromptHash?: string;
  readonly expiresAtMs: number;
}

export interface SemanticCacheCandidate {
  readonly completion: ProviderChatCompletion;
  readonly embedding: readonly number[];
  readonly metadata: Omit<CachedSemanticMetadata, "embedding">;
}

export interface SemanticCacheQuery {
  readonly tenantHash: string;
  readonly model: string;
  readonly embeddingProvider: string;
  readonly embeddingDimensions: number;
  readonly semanticPolicyVersion: string;
  readonly systemPromptHash?: string;
  readonly maxCandidates: number;
}
