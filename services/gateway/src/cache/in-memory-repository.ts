import type { ProviderChatCompletion } from "../chat/types.js";
import type { CacheRepository } from "./repository.js";
import type { CachedChatCompletion } from "./types.js";

export function createInMemoryCacheRepository(): CacheRepository {
  const entries = new Map<string, CachedChatCompletion>();

  return {
    getExact: async (cacheKey) => {
      const entry = entries.get(cacheKey);

      if (!entry) {
        return undefined;
      }

      return {
        completion: cloneCompletion(entry.completion)
      };
    },
    setExact: async (cacheKey, entry) => {
      entries.set(cacheKey, {
        completion: cloneCompletion(entry.completion)
      });
    }
  };
}

function cloneCompletion(completion: ProviderChatCompletion): ProviderChatCompletion {
  return {
    ...completion,
    choices: completion.choices.map((choice) => ({
      ...choice,
      message: {
        ...choice.message
      }
    }))
  };
}
