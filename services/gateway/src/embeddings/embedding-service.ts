import type { EmbeddingProvider } from "./provider.js";

export interface EmbeddingService {
  createEmbedding(input: string): Promise<readonly number[]>;
}

export class EmbeddingServiceError extends Error {
  public override readonly name = "EmbeddingServiceError";

  public constructor(message: string, options: { readonly cause: unknown }) {
    super(message, options);
  }
}

export function createEmbeddingService(provider: EmbeddingProvider): EmbeddingService {
  return new DefaultEmbeddingService(provider);
}

class DefaultEmbeddingService implements EmbeddingService {
  private readonly provider: EmbeddingProvider;

  public constructor(provider: EmbeddingProvider) {
    this.provider = provider;
  }

  public async createEmbedding(input: string): Promise<readonly number[]> {
    try {
      return await this.provider.createEmbedding(input);
    } catch (error) {
      throw new EmbeddingServiceError("Embedding provider failed.", {
        cause: error
      });
    }
  }
}
