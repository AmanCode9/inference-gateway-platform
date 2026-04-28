import { describe, expect, it } from "vitest";
import { createConfiguredEmbeddingProvider } from "../../src/embeddings/factory.js";
import { DeterministicMockEmbeddingProvider } from "../../src/embeddings/mock-embedding-provider.js";

describe("createConfiguredEmbeddingProvider", () => {
  it("returns undefined when embeddings are disabled", () => {
    expect(
      createConfiguredEmbeddingProvider({
        provider: "disabled",
        dimensions: 384
      })
    ).toBeUndefined();
  });

  it("creates the deterministic mock embedding provider", async () => {
    const provider = createConfiguredEmbeddingProvider({
      provider: "mock",
      dimensions: 8
    });

    expect(provider).toBeInstanceOf(DeterministicMockEmbeddingProvider);
    await expect(provider?.createEmbedding("input")).resolves.toHaveLength(8);
  });
});
