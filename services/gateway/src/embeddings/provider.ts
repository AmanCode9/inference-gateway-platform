export interface EmbeddingProvider {
  createEmbedding(input: string): Promise<readonly number[]>;
}
