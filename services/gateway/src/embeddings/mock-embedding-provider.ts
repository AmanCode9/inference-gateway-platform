import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./provider.js";

export interface DeterministicMockEmbeddingProviderConfig {
  readonly dimensions: number;
}

export class DeterministicMockEmbeddingProvider implements EmbeddingProvider {
  private readonly dimensions: number;

  public constructor(config: DeterministicMockEmbeddingProviderConfig) {
    if (!Number.isInteger(config.dimensions) || config.dimensions <= 0) {
      throw new Error("Embedding dimensions must be a positive integer.");
    }

    this.dimensions = config.dimensions;
  }

  public async createEmbedding(input: string): Promise<readonly number[]> {
    const values = Array.from({ length: this.dimensions }, (_entry, index) =>
      hashToSignedUnitValue(input, index)
    );
    const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));

    if (magnitude === 0) {
      return values;
    }

    return values.map((value) => value / magnitude);
  }
}

function hashToSignedUnitValue(input: string, index: number): number {
  const digest = createHash("sha256").update(input).update("\0").update(index.toString()).digest();
  const unsigned = digest.readUInt32BE(0);

  return (unsigned / 0xffff_ffff) * 2 - 1;
}
