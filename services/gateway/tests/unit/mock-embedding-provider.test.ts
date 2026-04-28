import { describe, expect, it } from "vitest";
import { DeterministicMockEmbeddingProvider } from "../../src/embeddings/mock-embedding-provider.js";

describe("DeterministicMockEmbeddingProvider", () => {
  it("returns the same vector for the same input", async () => {
    const provider = new DeterministicMockEmbeddingProvider({ dimensions: 16 });

    await expect(provider.createEmbedding("same input")).resolves.toEqual(
      await provider.createEmbedding("same input")
    );
  });

  it("returns different vectors for different inputs", async () => {
    const provider = new DeterministicMockEmbeddingProvider({ dimensions: 16 });

    await expect(provider.createEmbedding("first input")).resolves.not.toEqual(
      await provider.createEmbedding("second input")
    );
  });

  it("returns finite values with the configured dimension", async () => {
    const provider = new DeterministicMockEmbeddingProvider({ dimensions: 384 });
    const embedding = await provider.createEmbedding("dimension test");

    expect(embedding).toHaveLength(384);
    expect(embedding.every((value) => Number.isFinite(value))).toBe(true);
  });

  it("normalizes vectors to approximately unit length", async () => {
    const provider = new DeterministicMockEmbeddingProvider({ dimensions: 32 });
    const embedding = await provider.createEmbedding("normalized input");
    const magnitude = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));

    expect(magnitude).toBeCloseTo(1, 10);
  });

  it("rejects invalid dimensions", () => {
    expect(() => new DeterministicMockEmbeddingProvider({ dimensions: 0 })).toThrow(
      "Embedding dimensions must be a positive integer."
    );
  });
});
