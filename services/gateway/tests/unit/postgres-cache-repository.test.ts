import { describe, expect, it } from "vitest";
import type { ProviderChatCompletion } from "../../src/chat/types.js";
import { createExactChatCacheKey } from "../../src/cache/key.js";
import {
  createPostgresCacheRepository,
  type PostgresCacheClient,
  type PostgresQueryResult
} from "../../src/cache/postgres-repository.js";

describe("createPostgresCacheRepository", () => {
  it("returns a cached response after put", async () => {
    const client = new StatefulPostgresCacheClient();
    const repository = createRepository(client);
    const cacheKey = createCacheKey("tenant-a");

    await repository.setExact(cacheKey, {
      completion: createCompletion()
    });

    await expect(repository.getExact(cacheKey)).resolves.toEqual({
      completion: createCompletion()
    });
    expect(client.records.size).toBe(1);
  });

  it("treats expired entries as misses", async () => {
    const client = new StatefulPostgresCacheClient();
    const repository = createRepository(client, {
      ttlSeconds: 1,
      now: () => new Date(client.nowMs)
    });
    const cacheKey = createCacheKey("tenant-a");

    await repository.setExact(cacheKey, {
      completion: createCompletion()
    });
    client.nowMs += 1_001;

    await expect(repository.getExact(cacheKey)).resolves.toBeUndefined();
  });

  it("isolates identical exact payloads across tenants", async () => {
    const client = new StatefulPostgresCacheClient();
    const repository = createRepository(client);

    await repository.setExact(createCacheKey("tenant-a"), {
      completion: createCompletion({ provider: "provider-a" })
    });

    await expect(repository.getExact(createCacheKey("tenant-b"))).resolves.toBeUndefined();
  });

  it("upserts without creating duplicate rows for the same tenant and key", async () => {
    const client = new StatefulPostgresCacheClient();
    const repository = createRepository(client);
    const cacheKey = createCacheKey("tenant-a");

    await repository.setExact(cacheKey, {
      completion: createCompletion({ provider: "provider-a" })
    });
    await repository.setExact(cacheKey, {
      completion: createCompletion({ provider: "provider-b" })
    });

    await expect(repository.getExact(cacheKey)).resolves.toEqual({
      completion: createCompletion({ provider: "provider-b" })
    });
    expect(client.records.size).toBe(1);
  });

  it("restores response bodies without raw API keys", async () => {
    const client = new StatefulPostgresCacheClient();
    const repository = createRepository(client);
    const cacheKey = createCacheKey("tenant-secret-api-key");

    await repository.setExact(cacheKey, {
      completion: createCompletion({
        id: "chatcmpl_restored",
        model: "restored-model",
        provider: "mock-restored",
        content: "restored content"
      })
    });

    const record = [...client.records.values()][0];

    expect(record?.tenantHash).not.toContain("tenant-secret-api-key");
    expect(record?.exactCacheKey).not.toContain("tenant-secret-api-key");
    await expect(repository.getExact(cacheKey)).resolves.toEqual({
      completion: createCompletion({
        id: "chatcmpl_restored",
        model: "restored-model",
        provider: "mock-restored",
        content: "restored content"
      })
    });
  });

  it("uses parameterized SQL for exact cache operations", async () => {
    const client = new StatefulPostgresCacheClient();
    const repository = createRepository(client);
    const cacheKey = createCacheKey("tenant-a");

    await repository.setExact(cacheKey, {
      completion: createCompletion()
    });
    await repository.getExact(cacheKey);

    expect(client.queries).toHaveLength(2);
    expect(client.queries[0]?.text).toContain("$1");
    expect(client.queries[0]?.text).not.toContain(cacheKey);
    expect(client.queries[1]?.text).toContain("$1");
    expect(client.queries[1]?.text).not.toContain(cacheKey);
  });
});

interface StoredRecord {
  readonly tenantHash: string;
  readonly exactCacheKey: string;
  readonly responseBody: unknown;
  readonly expiresAtMs: number;
  readonly model: string;
  readonly providerId: string;
  readonly requestFingerprint: string;
  readonly cachePolicyVersion: string;
  readonly hitCount: number;
}

class StatefulPostgresCacheClient implements PostgresCacheClient {
  public readonly records = new Map<string, StoredRecord>();
  public readonly queries: Array<{
    readonly text: string;
    readonly values: readonly unknown[];
  }> = [];
  public nowMs = Date.UTC(2026, 3, 26, 12, 0, 0);

  public async query<Row>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<PostgresQueryResult<Row>> {
    this.queries.push({ text, values });

    if (text.includes("INSERT INTO exact_cache_entries")) {
      return this.insert<Row>(values);
    }

    if (text.includes("UPDATE exact_cache_entries")) {
      return this.get<Row>(values);
    }

    throw new Error("Unexpected query.");
  }

  private insert<Row>(values: readonly unknown[]): PostgresQueryResult<Row> {
    const tenantHash = readString(values[0]);
    const exactCacheKey = readString(values[1]);
    const responseBody = JSON.parse(readString(values[2])) as unknown;
    const model = readString(values[3]);
    const providerId = readString(values[4]);
    const requestFingerprint = readString(values[5]);
    const cachePolicyVersion = readString(values[6]);
    const expiresAt = values[7];

    if (!(expiresAt instanceof Date)) {
      throw new Error("Expected expires_at to be a Date.");
    }

    this.records.set(recordKey(tenantHash, exactCacheKey), {
      tenantHash,
      exactCacheKey,
      responseBody,
      expiresAtMs: expiresAt.getTime(),
      model,
      providerId,
      requestFingerprint,
      cachePolicyVersion,
      hitCount: 0
    });

    return {
      rows: [],
      rowCount: 1
    };
  }

  private get<Row>(values: readonly unknown[]): PostgresQueryResult<Row> {
    const tenantHash = readString(values[0]);
    const exactCacheKey = readString(values[1]);
    const currentRecord = this.records.get(recordKey(tenantHash, exactCacheKey));

    if (!currentRecord || currentRecord.expiresAtMs <= this.nowMs) {
      return {
        rows: [],
        rowCount: 0
      };
    }

    const nextRecord = {
      ...currentRecord,
      hitCount: currentRecord.hitCount + 1
    };
    this.records.set(recordKey(tenantHash, exactCacheKey), nextRecord);

    return {
      rows: [{ response_body: nextRecord.responseBody } as Row],
      rowCount: 1
    };
  }
}

function createRepository(
  client: StatefulPostgresCacheClient,
  overrides: {
    readonly ttlSeconds?: number;
    readonly now?: () => Date;
  } = {}
) {
  const dependencies = {
    client,
    ttlSeconds: overrides.ttlSeconds ?? 86_400,
    operationTimeoutMs: 1_000
  };

  return overrides.now
    ? createPostgresCacheRepository({
        ...dependencies,
        now: overrides.now
      })
    : createPostgresCacheRepository(dependencies);
}

function createCacheKey(apiKey: string): string {
  return createExactChatCacheKey({
    apiKey,
    request: {
      model: "mock-model",
      messages: [{ role: "user", content: "hello" }]
    }
  });
}

function createCompletion(
  overrides: {
    readonly id?: string;
    readonly model?: string;
    readonly provider?: string;
    readonly content?: string;
  } = {}
): ProviderChatCompletion {
  return {
    id: overrides.id ?? "chatcmpl_test",
    object: "chat.completion",
    created: 1_776_000_000,
    model: overrides.model ?? "mock-model",
    provider: overrides.provider ?? "mock",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: overrides.content ?? "Mock provider reply: hello"
        },
        finishReason: "stop"
      }
    ]
  };
}

function readString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected string query value.");
  }

  return value;
}

function recordKey(tenantHash: string, exactCacheKey: string): string {
  return `${tenantHash}:${exactCacheKey}`;
}
