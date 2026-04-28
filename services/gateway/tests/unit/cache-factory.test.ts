import { describe, expect, it } from "vitest";
import { createConfiguredCacheRepository } from "../../src/cache/factory.js";
import type { PostgresQueryResult } from "../../src/cache/postgres-repository.js";
import type { CacheConfig, CachePostgresConfig } from "../../src/config/index.js";
import type { PostgresPoolLike } from "../../src/postgres/client.js";

describe("createConfiguredCacheRepository", () => {
  it("selects the in-memory exact cache backend", async () => {
    const handle = createConfiguredCacheRepository(createMemoryConfig());

    expect(handle.backend).toBe("memory");
    await expect(handle.close()).resolves.toBeUndefined();
  });

  it("selects the Postgres exact cache backend", async () => {
    let createdWith: CachePostgresConfig | undefined;
    const client = new StubPostgresPool();
    const handle = createConfiguredCacheRepository(createPostgresConfig(), {
      createPostgresClient: (config) => {
        createdWith = config;
        return client;
      }
    });

    expect(handle.backend).toBe("postgres");
    expect(createdWith).toEqual(createPostgresConfig().postgres);
    await handle.close();
    expect(client.closed).toBe(true);
  });
});

class StubPostgresPool implements PostgresPoolLike {
  public closed = false;

  public async query<Row>(): Promise<PostgresQueryResult<Row>> {
    return {
      rows: [],
      rowCount: 0
    };
  }

  public async end(): Promise<void> {
    this.closed = true;
  }
}

function createMemoryConfig(): CacheConfig {
  return {
    exactEnabled: true,
    backend: "memory",
    ttlSeconds: 86_400,
    semantic: {
      enabled: false,
      threshold: 0.97,
      maxCandidates: 10,
      policyVersion: "v1"
    }
  };
}

function createPostgresConfig(): CacheConfig & { readonly postgres: CachePostgresConfig } {
  return {
    exactEnabled: true,
    backend: "postgres",
    ttlSeconds: 86_400,
    semantic: {
      enabled: false,
      threshold: 0.97,
      maxCandidates: 10,
      policyVersion: "v1"
    },
    postgres: {
      databaseUrl: "postgres://user:pass@localhost:5432/inference_gateway",
      operationTimeoutMs: 100
    }
  };
}
