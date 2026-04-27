import type { CacheConfig, CachePostgresConfig } from "../config/index.js";
import { createPostgresPool, type PostgresPoolLike } from "../postgres/client.js";
import { createInMemoryCacheRepository } from "./in-memory-repository.js";
import { createPostgresCacheRepository } from "./postgres-repository.js";
import type { CacheRepository } from "./repository.js";

export interface CacheRepositoryHandle {
  readonly backend: CacheConfig["backend"];
  readonly repository: CacheRepository;
  close(): Promise<void>;
}

export interface CacheRepositoryFactoryDependencies {
  readonly createPostgresClient?: (config: CachePostgresConfig) => PostgresPoolLike;
}

export function createConfiguredCacheRepository(
  config: CacheConfig,
  dependencies: CacheRepositoryFactoryDependencies = {}
): CacheRepositoryHandle {
  if (config.backend === "memory") {
    return {
      backend: "memory",
      repository: createInMemoryCacheRepository(),
      close: async () => {
        return;
      }
    };
  }

  if (!config.postgres) {
    throw new Error("Postgres cache backend requires Postgres cache configuration.");
  }

  const postgresClient = (dependencies.createPostgresClient ?? createPostgresPool)(config.postgres);

  return {
    backend: "postgres",
    repository: createPostgresCacheRepository({
      client: postgresClient,
      ttlSeconds: config.ttlSeconds,
      operationTimeoutMs: config.postgres.operationTimeoutMs
    }),
    close: () => postgresClient.end()
  };
}
