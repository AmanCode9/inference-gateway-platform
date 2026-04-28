import type { ProviderChatCompletion } from "../chat/types.js";
import type { CacheRepository } from "./repository.js";
import type { CachedChatCompletion, CachedSemanticMetadata, SemanticCacheCandidate } from "./types.js";

export function createInMemoryCacheRepository(): CacheRepository {
  const entries = new Map<string, CachedChatCompletion>();

  return {
    getExact: async (cacheKey) => {
      const entry = entries.get(cacheKey);

      if (!entry) {
        return undefined;
      }

      return cloneEntry(entry);
    },
    setExact: async (cacheKey, entry) => {
      entries.set(cacheKey, cloneEntry(entry));
    },
    getSemanticCandidates: async (query) => {
      const nowMs = Date.now();
      const candidates: SemanticCacheCandidate[] = [];

      for (const entry of entries.values()) {
        const metadata = entry.semanticMetadata;

        if (!metadata || metadata.expiresAtMs <= nowMs) {
          continue;
        }

        if (
          metadata.tenantHash !== query.tenantHash ||
          metadata.model !== query.model ||
          metadata.embeddingProvider !== query.embeddingProvider ||
          metadata.embeddingDimensions !== query.embeddingDimensions ||
          metadata.semanticPolicyVersion !== query.semanticPolicyVersion ||
          metadata.systemPromptHash !== query.systemPromptHash
        ) {
          continue;
        }

        const candidateMetadata = {
          tenantHash: metadata.tenantHash,
          model: metadata.model,
          embeddingProvider: metadata.embeddingProvider,
          embeddingDimensions: metadata.embeddingDimensions,
          semanticPolicyVersion: metadata.semanticPolicyVersion,
          semanticInputHash: metadata.semanticInputHash,
          expiresAtMs: metadata.expiresAtMs,
          ...(metadata.systemPromptHash ? { systemPromptHash: metadata.systemPromptHash } : {})
        };

        candidates.push({
          completion: cloneCompletion(entry.completion),
          embedding: [...metadata.embedding],
          metadata: candidateMetadata
        });

        if (candidates.length >= query.maxCandidates) {
          break;
        }
      }

      return candidates;
    }
  };
}

function cloneEntry(entry: CachedChatCompletion): CachedChatCompletion {
  const semanticMetadata = cloneSemanticMetadata(entry.semanticMetadata);

  if (!semanticMetadata) {
    return {
      completion: cloneCompletion(entry.completion)
    };
  }

  return {
    completion: cloneCompletion(entry.completion),
    semanticMetadata
  };
}

function cloneSemanticMetadata(metadata: CachedSemanticMetadata | undefined): CachedSemanticMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  return {
    ...metadata,
    embedding: [...metadata.embedding]
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
