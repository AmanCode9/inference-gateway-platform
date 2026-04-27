import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProviderChatCompletion } from "../../src/chat/types.js";
import { createExactChatCacheKey } from "../../src/cache/key.js";
import { createPostgresCacheRepository } from "../../src/cache/postgres-repository.js";
import { createPostgresPool, type PostgresPoolLike } from "../../src/postgres/client.js";

const postgresTestDatabaseUrl = process.env.POSTGRES_CACHE_TEST_DATABASE_URL;
const describePostgres = postgresTestDatabaseUrl ? describe : describe.skip;

describePostgres("Postgres exact cache repository live integration", () => {
  let pool: PostgresPoolLike | undefined;

  beforeAll(async () => {
    if (!postgresTestDatabaseUrl) {
      throw new Error("POSTGRES_CACHE_TEST_DATABASE_URL is required for live Postgres cache tests.");
    }

    pool = createPostgresPool({
      databaseUrl: postgresTestDatabaseUrl,
      operationTimeoutMs: 2_000
    });
    await pool.query(readMigrationSql());
    await pool.query("TRUNCATE exact_cache_entries");
  });

  afterAll(async () => {
    await pool?.query("TRUNCATE exact_cache_entries");
    await pool?.end();
  });

  it("persists and restores exact cache entries through Postgres", async () => {
    if (!pool) {
      throw new Error("Expected Postgres pool to be initialized.");
    }

    const repository = createPostgresCacheRepository({
      client: pool,
      ttlSeconds: 86_400,
      operationTimeoutMs: 2_000
    });
    const cacheKey = createExactChatCacheKey({
      apiKey: "tenant-live-test",
      request: {
        model: "mock-model",
        messages: [{ role: "user", content: "live postgres cache" }]
      }
    });

    await repository.setExact(cacheKey, {
      completion: createCompletion()
    });

    await expect(repository.getExact(cacheKey)).resolves.toEqual({
      completion: createCompletion()
    });
  });
});

function readMigrationSql(): string {
  return readFileSync(
    new URL("../../../../infra/postgres/migrations/001_exact_cache_entries.sql", import.meta.url),
    "utf8"
  );
}

function createCompletion(): ProviderChatCompletion {
  return {
    id: "chatcmpl_live_postgres_test",
    object: "chat.completion",
    created: 1_776_000_000,
    model: "mock-model",
    provider: "mock",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "Mock provider reply: live postgres cache"
        },
        finishReason: "stop"
      }
    ]
  };
}
