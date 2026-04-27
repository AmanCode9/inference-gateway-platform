import type { ProviderChatCompletion, ChatCompletionChoice } from "../chat/types.js";
import { parseExactChatCacheKey } from "./key.js";
import type { CacheRepository } from "./repository.js";
import type { CachedChatCompletion } from "./types.js";

export interface PostgresQueryResult<Row> {
  readonly rows: readonly Row[];
  readonly rowCount: number | null;
}

export interface PostgresCacheClient {
  query<Row>(
    text: string,
    values?: readonly unknown[]
  ): Promise<PostgresQueryResult<Row>>;
}

export interface PostgresCacheRepositoryDependencies {
  readonly client: PostgresCacheClient;
  readonly ttlSeconds: number;
  readonly operationTimeoutMs: number;
  readonly now?: () => Date;
}

interface ExactCacheRow {
  readonly response_body: unknown;
}

export function createPostgresCacheRepository(
  dependencies: PostgresCacheRepositoryDependencies
): CacheRepository {
  return new PostgresCacheRepository(dependencies);
}

class PostgresCacheRepository implements CacheRepository {
  private readonly client: PostgresCacheClient;
  private readonly ttlSeconds: number;
  private readonly operationTimeoutMs: number;
  private readonly now: () => Date;

  public constructor(dependencies: PostgresCacheRepositoryDependencies) {
    this.client = dependencies.client;
    this.ttlSeconds = dependencies.ttlSeconds;
    this.operationTimeoutMs = dependencies.operationTimeoutMs;
    this.now = dependencies.now ?? (() => new Date());
  }

  public async getExact(cacheKey: string): Promise<CachedChatCompletion | undefined> {
    const keyParts = parseExactChatCacheKey(cacheKey);
    const result = await this.queryWithTimeout<ExactCacheRow>(
      `
        UPDATE exact_cache_entries
        SET
          last_accessed_at = now(),
          hit_count = hit_count + 1
        WHERE tenant_hash = $1
          AND exact_cache_key = $2
          AND expires_at > now()
        RETURNING response_body
      `,
      [keyParts.tenantHash, keyParts.exactCacheKey]
    );
    const row = result.rows[0];

    if (!row) {
      return undefined;
    }

    return {
      completion: parseProviderChatCompletion(row.response_body)
    };
  }

  public async setExact(cacheKey: string, entry: CachedChatCompletion): Promise<void> {
    const keyParts = parseExactChatCacheKey(cacheKey);
    const expiresAt = new Date(this.now().getTime() + this.ttlSeconds * 1_000);

    await this.queryWithTimeout(
      `
        INSERT INTO exact_cache_entries (
          tenant_hash,
          exact_cache_key,
          response_body,
          model,
          provider_id,
          request_fingerprint,
          cache_policy_version,
          expires_at
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
        ON CONFLICT (tenant_hash, exact_cache_key)
        DO UPDATE SET
          response_body = EXCLUDED.response_body,
          model = EXCLUDED.model,
          provider_id = EXCLUDED.provider_id,
          request_fingerprint = EXCLUDED.request_fingerprint,
          cache_policy_version = EXCLUDED.cache_policy_version,
          created_at = now(),
          expires_at = EXCLUDED.expires_at,
          last_accessed_at = NULL,
          hit_count = 0
      `,
      [
        keyParts.tenantHash,
        keyParts.exactCacheKey,
        JSON.stringify(entry.completion),
        entry.completion.model,
        entry.completion.provider,
        keyParts.requestFingerprint,
        keyParts.cachePolicyVersion,
        expiresAt
      ]
    );
  }

  private async queryWithTimeout<Row = unknown>(
    text: string,
    values: readonly unknown[]
  ): Promise<PostgresQueryResult<Row>> {
    return await withTimeout(
      this.client.query<Row>(text, values),
      this.operationTimeoutMs,
      "Postgres cache operation timed out."
    );
  }
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function parseProviderChatCompletion(value: unknown): ProviderChatCompletion {
  if (!isRecord(value)) {
    throw new Error("Invalid cached completion.");
  }

  const completion = {
    id: readString(value, "id"),
    object: readLiteral(value, "object", "chat.completion"),
    created: readNumber(value, "created"),
    model: readString(value, "model"),
    provider: readString(value, "provider"),
    choices: readChoices(value["choices"])
  } satisfies ProviderChatCompletion;

  return completion;
}

function readChoices(value: unknown): readonly ChatCompletionChoice[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid cached completion choices.");
  }

  return value.map((choice) => {
    if (!isRecord(choice)) {
      throw new Error("Invalid cached completion choice.");
    }

    const message = choice["message"];

    if (!isRecord(message)) {
      throw new Error("Invalid cached completion choice message.");
    }

    return {
      index: readNumber(choice, "index"),
      message: {
        role: readLiteral(message, "role", "assistant"),
        content: readString(message, "content")
      },
      finishReason: readLiteral(choice, "finishReason", "stop")
    } satisfies ChatCompletionChoice;
  });
}

function readString(value: Record<string, unknown>, field: string): string {
  const fieldValue = value[field];

  if (typeof fieldValue !== "string") {
    throw new Error(`Invalid cached completion ${field}.`);
  }

  return fieldValue;
}

function readNumber(value: Record<string, unknown>, field: string): number {
  const fieldValue = value[field];

  if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) {
    throw new Error(`Invalid cached completion ${field}.`);
  }

  return fieldValue;
}

function readLiteral<T extends string>(
  value: Record<string, unknown>,
  field: string,
  expected: T
): T {
  const fieldValue = value[field];

  if (fieldValue !== expected) {
    throw new Error(`Invalid cached completion ${field}.`);
  }

  return expected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
