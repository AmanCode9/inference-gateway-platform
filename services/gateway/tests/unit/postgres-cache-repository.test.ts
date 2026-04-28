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

  it("returns tenant and model compatible semantic candidates", async () => {
    const client = new StatefulPostgresCacheClient();
    const repository = createRepository(client, {
      now: () => new Date(client.nowMs)
    });
    const cacheKey = createCacheKey("tenant-a");

    await repository.setExact(cacheKey, {
      completion: createCompletion(),
      semanticMetadata: {
        tenantHash: extractTenantHash(cacheKey),
        model: "mock-model",
        embedding: [1, 0],
        embeddingProvider: "mock",
        embeddingDimensions: 2,
        semanticPolicyVersion: "v1",
        semanticInputHash: "semantic-input-a",
        expiresAtMs: client.nowMs + 86_400_000
      }
    });

    await expect(
      repository.getSemanticCandidates({
        tenantHash: extractTenantHash(cacheKey),
        model: "mock-model",
        embeddingProvider: "mock",
        embeddingDimensions: 2,
        semanticPolicyVersion: "v1",
        maxCandidates: 10
      })
    ).resolves.toEqual([
      {
        completion: createCompletion(),
        embedding: [1, 0],
        metadata: {
          tenantHash: extractTenantHash(cacheKey),
          model: "mock-model",
          embeddingProvider: "mock",
          embeddingDimensions: 2,
          semanticPolicyVersion: "v1",
          semanticInputHash: "semantic-input-a",
          expiresAtMs: client.nowMs + 86_400_000
        }
      }
    ]);
  });

  it("filters semantic candidates by tenant, model, and expiry", async () => {
    const client = new StatefulPostgresCacheClient();
    const repository = createRepository(client, {
      ttlSeconds: 1,
      now: () => new Date(client.nowMs)
    });
    const cacheKey = createCacheKey("tenant-a");
    const tenantHash = extractTenantHash(cacheKey);

    await repository.setExact(cacheKey, {
      completion: createCompletion(),
      semanticMetadata: {
        tenantHash,
        model: "mock-model",
        embedding: [1, 0],
        embeddingProvider: "mock",
        embeddingDimensions: 2,
        semanticPolicyVersion: "v1",
        semanticInputHash: "semantic-input-a",
        expiresAtMs: client.nowMs + 1_000
      }
    });

    await expect(
      repository.getSemanticCandidates({
        tenantHash: extractTenantHash(createCacheKey("tenant-b")),
        model: "mock-model",
        embeddingProvider: "mock",
        embeddingDimensions: 2,
        semanticPolicyVersion: "v1",
        maxCandidates: 10
      })
    ).resolves.toEqual([]);
    await expect(
      repository.getSemanticCandidates({
        tenantHash,
        model: "different-model",
        embeddingProvider: "mock",
        embeddingDimensions: 2,
        semanticPolicyVersion: "v1",
        maxCandidates: 10
      })
    ).resolves.toEqual([]);

    client.nowMs += 1_001;

    await expect(
      repository.getSemanticCandidates({
        tenantHash,
        model: "mock-model",
        embeddingProvider: "mock",
        embeddingDimensions: 2,
        semanticPolicyVersion: "v1",
        maxCandidates: 10
      })
    ).resolves.toEqual([]);
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
  readonly semanticInputHash?: string;
  readonly semanticEmbedding?: readonly number[];
  readonly embeddingProvider?: string;
  readonly embeddingDimensions?: number;
  readonly semanticPolicyVersion?: string;
  readonly systemPromptHash?: string;
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

    if (text.includes("SELECT") && text.includes("semantic_cache_eligible")) {
      return this.getSemanticCandidates<Row>(values);
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

    const semanticInputHash = values.length > 8 ? readString(values[8]) : undefined;
    const semanticEmbedding = values.length > 9 ? parseEmbeddingJson(values[9]) : undefined;
    const embeddingProvider = values.length > 10 ? readString(values[10]) : undefined;
    const embeddingDimensions = values.length > 11 ? readNumber(values[11]) : undefined;
    const semanticPolicyVersion = values.length > 12 ? readString(values[12]) : undefined;
    const systemPromptHash = values.length > 13 && values[13] !== null ? readString(values[13]) : undefined;

    this.records.set(recordKey(tenantHash, exactCacheKey), {
      tenantHash,
      exactCacheKey,
      responseBody,
      expiresAtMs: expiresAt.getTime(),
      model,
      providerId,
      requestFingerprint,
      cachePolicyVersion,
      hitCount: 0,
      ...(semanticInputHash ? { semanticInputHash } : {}),
      ...(semanticEmbedding ? { semanticEmbedding } : {}),
      ...(embeddingProvider ? { embeddingProvider } : {}),
      ...(embeddingDimensions ? { embeddingDimensions } : {}),
      ...(semanticPolicyVersion ? { semanticPolicyVersion } : {}),
      ...(systemPromptHash ? { systemPromptHash } : {})
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

  private getSemanticCandidates<Row>(values: readonly unknown[]): PostgresQueryResult<Row> {
    const tenantHash = readString(values[0]);
    const model = readString(values[1]);
    const embeddingProvider = readString(values[2]);
    const embeddingDimensions = readNumber(values[3]);
    const semanticPolicyVersion = readString(values[4]);
    const systemPromptHash = values[5] === null ? undefined : readString(values[5]);
    const maxCandidates = readNumber(values[6]);
    const rows: Row[] = [];

    for (const record of this.records.values()) {
      if (
        record.tenantHash !== tenantHash ||
        record.model !== model ||
        record.embeddingProvider !== embeddingProvider ||
        record.embeddingDimensions !== embeddingDimensions ||
        record.semanticPolicyVersion !== semanticPolicyVersion ||
        record.systemPromptHash !== systemPromptHash ||
        !record.semanticEmbedding ||
        !record.semanticInputHash ||
        record.expiresAtMs <= this.nowMs
      ) {
        continue;
      }

      rows.push({
        response_body: record.responseBody,
        semantic_embedding: record.semanticEmbedding,
        semantic_input_hash: record.semanticInputHash,
        system_prompt_hash: record.systemPromptHash ?? null,
        expires_at: new Date(record.expiresAtMs)
      } as Row);

      if (rows.length >= maxCandidates) {
        break;
      }
    }

    return {
      rows,
      rowCount: rows.length
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

function readNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Expected number query value.");
  }

  return value;
}

function parseEmbeddingJson(value: unknown): readonly number[] {
  const parsed = JSON.parse(readString(value)) as unknown;

  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new Error("Expected semantic embedding JSON array.");
  }

  return parsed;
}

function recordKey(tenantHash: string, exactCacheKey: string): string {
  return `${tenantHash}:${exactCacheKey}`;
}

function extractTenantHash(cacheKey: string): string {
  const match = /tenant:([a-f0-9]{64}):payload:/.exec(cacheKey);

  if (!match?.[1]) {
    throw new Error("Expected tenant hash in cache key.");
  }

  return match[1];
}
