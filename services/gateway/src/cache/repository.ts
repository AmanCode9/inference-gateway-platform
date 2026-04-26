import type { CachedChatCompletion } from "./types.js";

export interface CacheRepository {
  getExact(cacheKey: string): Promise<CachedChatCompletion | undefined>;
  setExact(cacheKey: string, entry: CachedChatCompletion): Promise<void>;
}
