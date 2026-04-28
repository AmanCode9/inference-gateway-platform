import { describe, expect, it } from "vitest";
import {
  createEmbeddingService,
  EmbeddingServiceError
} from "../../src/embeddings/embedding-service.js";
import type { EmbeddingProvider } from "../../src/embeddings/provider.js";

describe("createEmbeddingService", () => {
  it("delegates embedding generation to the configured provider", async () => {
    const service = createEmbeddingService({
      createEmbedding: async () => [0.1, 0.2]
    });

    await expect(service.createEmbedding("input")).resolves.toEqual([0.1, 0.2]);
  });

  it("wraps provider failures in a stable service error", async () => {
    const provider: EmbeddingProvider = {
      createEmbedding: async () => {
        throw new Error("provider failed");
      }
    };
    const service = createEmbeddingService(provider);

    await expect(service.createEmbedding("input")).rejects.toBeInstanceOf(EmbeddingServiceError);
    await expect(service.createEmbedding("input")).rejects.toThrow("Embedding provider failed.");
  });
});
