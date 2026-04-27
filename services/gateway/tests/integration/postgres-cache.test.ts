import { afterEach, describe, expect, it } from "vitest";
import {
  createPostgresCacheRepository,
  type PostgresCacheClient,
  type PostgresQueryResult
} from "../../src/cache/postgres-repository.js";
import { startTestServer, type TestServer } from "./test-server.js";

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("POST /v1/chat/completions with Postgres exact cache", () => {
  it("returns miss then hit-exact for identical valid requests", async () => {
    const postgresClient = new StatefulPostgresCacheClient();
    server = await startPostgresCacheServer(postgresClient);

    const firstResponse = await sendChat("req_pg_cache_first");
    const secondResponse = await sendChat("req_pg_cache_second");
    const secondBody = (await secondResponse.json()) as {
      id?: string;
      requestId?: string;
    };

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get("x-cache-status")).toBe("miss");
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get("x-cache-status")).toBe("hit-exact");
    expect(secondResponse.headers.get("x-request-id")).toBe("req_pg_cache_second");
    expect(secondBody.requestId).toBe("req_pg_cache_second");
    expect(secondBody.id).toMatch(/^chatcmpl_/);
    expect(secondBody.id).not.toContain("req_pg_cache_first");
    expect(secondBody.id).not.toContain("req_pg_cache_second");
    expect(server.metrics().providerSelected.mock).toBe(1);
    expect(server.cacheMetrics()).toMatchObject({
      exactHitCount: 1,
      missCount: 1
    });
  });

  it("does not share persistent exact cache entries across API keys", async () => {
    const postgresClient = new StatefulPostgresCacheClient();
    server = await startPostgresCacheServer(postgresClient, {
      GATEWAY_API_KEY: "tenant-a-key"
    });

    const firstResponse = await sendChat("req_pg_tenant_a", "tenant-a-key");

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get("x-cache-status")).toBe("miss");
    expect(server.metrics().providerSelected.mock).toBe(1);

    await server.close();
    server = await startPostgresCacheServer(postgresClient, {
      GATEWAY_API_KEY: "tenant-b-key"
    });

    const secondResponse = await sendChat("req_pg_tenant_b", "tenant-b-key");

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get("x-cache-status")).toBe("miss");
    expect(server.metrics().providerSelected.mock).toBe(1);
  });

  it("treats expired persistent entries as misses", async () => {
    const postgresClient = new StatefulPostgresCacheClient();
    server = await startPostgresCacheServer(postgresClient, {}, 1);

    const firstResponse = await sendChat("req_pg_expiry_first");
    postgresClient.nowMs += 1_001;
    const secondResponse = await sendChat("req_pg_expiry_second");

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get("x-cache-status")).toBe("miss");
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get("x-cache-status")).toBe("miss");
    expect(server.metrics().providerSelected.mock).toBe(2);
    expect(server.cacheMetrics()).toMatchObject({
      exactHitCount: 0,
      missCount: 2
    });
  });

  it("rejects invalid API keys before persistent cache lookup", async () => {
    const postgresClient = new StatefulPostgresCacheClient({
      failRead: true,
      failWrite: true
    });
    server = await startPostgresCacheServer(postgresClient);

    const response = await sendChat("req_pg_bad_auth", "wrong-gateway-key");

    expect(response.status).toBe(401);
    expect(postgresClient.queryCount).toBe(0);
    expect(server.metrics().providerSelected.mock).toBeUndefined();
  });

  it("rejects governance failures before persistent cache lookup", async () => {
    const postgresClient = new StatefulPostgresCacheClient({
      failRead: true,
      failWrite: true
    });
    server = await startPostgresCacheServer(postgresClient, {
      DAILY_TOKEN_QUOTA: "1",
      TOKEN_ESTIMATE_CHARS_PER_TOKEN: "1"
    });

    const response = await sendChat("req_pg_governance_reject");
    const body = (await response.json()) as {
      error?: {
        code?: string;
      };
    };

    expect(response.status).toBe(429);
    expect(body.error?.code).toBe("daily_token_quota_exceeded");
    expect(postgresClient.queryCount).toBe(0);
    expect(server.metrics().providerSelected.mock).toBeUndefined();
  });

  it("fails open when persistent cache reads fail", async () => {
    const postgresClient = new StatefulPostgresCacheClient({
      failRead: true
    });
    server = await startPostgresCacheServer(postgresClient);

    const response = await sendChat("req_pg_read_failure");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cache-status")).toBe("bypass");
    expect(server.metrics().providerSelected.mock).toBe(1);
    expect(server.cacheMetrics()).toMatchObject({
      bypassCount: 1,
      readErrorCount: 1
    });
  });

  it("fails open when persistent cache writes fail", async () => {
    const postgresClient = new StatefulPostgresCacheClient({
      failWrite: true
    });
    server = await startPostgresCacheServer(postgresClient);

    const response = await sendChat("req_pg_write_failure");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cache-status")).toBe("miss");
    expect(server.metrics().providerSelected.mock).toBe(1);
    expect(server.cacheMetrics()).toMatchObject({
      missCount: 1,
      writeErrorCount: 1
    });
  });
});

interface StoredRecord {
  readonly tenantHash: string;
  readonly exactCacheKey: string;
  readonly responseBody: unknown;
  readonly expiresAtMs: number;
}

class StatefulPostgresCacheClient implements PostgresCacheClient {
  public readonly records = new Map<string, StoredRecord>();
  public nowMs = Date.UTC(2026, 3, 26, 12, 0, 0);
  private readonly failRead: boolean;
  private readonly failWrite: boolean;
  private queries = 0;

  public constructor(options: { readonly failRead?: boolean; readonly failWrite?: boolean } = {}) {
    this.failRead = options.failRead ?? false;
    this.failWrite = options.failWrite ?? false;
  }

  public get queryCount(): number {
    return this.queries;
  }

  public async query<Row>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<PostgresQueryResult<Row>> {
    this.queries += 1;

    if (text.includes("INSERT INTO exact_cache_entries")) {
      if (this.failWrite) {
        throw new Error("Simulated Postgres cache write failure.");
      }

      const tenantHash = readString(values[0]);
      const exactCacheKey = readString(values[1]);
      const responseBody = JSON.parse(readString(values[2])) as unknown;
      const expiresAt = values[7];

      if (!(expiresAt instanceof Date)) {
        throw new Error("Expected expires_at to be a Date.");
      }

      this.records.set(recordKey(tenantHash, exactCacheKey), {
        tenantHash,
        exactCacheKey,
        responseBody,
        expiresAtMs: expiresAt.getTime()
      });

      return {
        rows: [],
        rowCount: 1
      };
    }

    if (text.includes("UPDATE exact_cache_entries")) {
      if (this.failRead) {
        throw new Error("Simulated Postgres cache read failure.");
      }

      const tenantHash = readString(values[0]);
      const exactCacheKey = readString(values[1]);
      const record = this.records.get(recordKey(tenantHash, exactCacheKey));

      if (!record || record.expiresAtMs <= this.nowMs) {
        return {
          rows: [],
          rowCount: 0
        };
      }

      return {
        rows: [{ response_body: record.responseBody } as Row],
        rowCount: 1
      };
    }

    throw new Error("Unexpected Postgres cache query.");
  }
}

async function startPostgresCacheServer(
  postgresClient: StatefulPostgresCacheClient,
  overrides: NodeJS.ProcessEnv = {},
  ttlSeconds = 86_400
): Promise<TestServer> {
  return await startTestServer(
    {
      CACHE_ENABLED: "true",
      CACHE_BACKEND: "postgres",
      CACHE_TTL_SECONDS: ttlSeconds.toString(),
      DATABASE_URL: "postgres://user:pass@localhost:5432/inference_gateway",
      ...overrides
    },
    {
      cacheRepository: createPostgresCacheRepository({
        client: postgresClient,
        ttlSeconds,
        operationTimeoutMs: 1_000,
        now: () => new Date(postgresClient.nowMs)
      })
    }
  );
}

async function sendChat(
  requestId: string,
  apiKey = "test-gateway-key"
): Promise<Response> {
  if (!server) {
    throw new Error("Expected test server to be started.");
  }

  return await fetch(server.url("/v1/chat/completions"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "x-request-id": requestId
    },
    body: JSON.stringify({
      model: "mock-model",
      messages: [{ role: "user", content: "persistent cache" }]
    })
  });
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
