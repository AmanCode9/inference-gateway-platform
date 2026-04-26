import type { ProviderChatCompletion } from "../chat/types.js";

export type CacheStatus = "miss" | "hit-exact" | "bypass";

export interface CachedChatCompletion {
  readonly completion: ProviderChatCompletion;
}
