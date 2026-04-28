import type { EmbeddingConfig } from "../config/index.js";
import { DeterministicMockEmbeddingProvider } from "./mock-embedding-provider.js";
import type { EmbeddingProvider } from "./provider.js";

export function createConfiguredEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider | undefined {
  if (config.provider === "disabled") {
    return undefined;
  }

  return new DeterministicMockEmbeddingProvider({
    dimensions: config.dimensions
  });
}
