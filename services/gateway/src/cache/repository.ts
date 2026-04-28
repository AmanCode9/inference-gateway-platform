import type { CachedChatCompletion, SemanticCacheCandidate, SemanticCacheQuery } from "./types.js";

export interface CacheRepository {
  getExact(cacheKey: string): Promise<CachedChatCompletion | undefined>;
  setExact(cacheKey: string, entry: CachedChatCompletion): Promise<void>;
  getSemanticCandidates(query: SemanticCacheQuery): Promise<readonly SemanticCacheCandidate[]>;
}
