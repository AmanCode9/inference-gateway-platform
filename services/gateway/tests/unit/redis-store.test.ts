import { describe, expect, it } from "vitest";
import { GOVERNANCE_ADMISSION_DEDUPLICATION_TTL_MS } from "../../src/governance/idempotency.js";
import { createRedisGovernanceStore } from "../../src/governance/redis-store.js";
import type { GovernanceStoreRequest } from "../../src/governance/types.js";
import { GovernanceStoreUnavailableError } from "../../src/governance/types.js";
import type { RedisLikeClient } from "../../src/redis/client.js";

describe("createRedisGovernanceStore", () => {
  it("charges exactly once for the same admission id", async () => {
    const client = new StatefulRedisClient();
    const store = createRedisGovernanceStore({
      client,
      redis: createRedisConfig()
    });

    const firstResult = await store.enforceRequest(createStoreRequest());
    const secondResult = await store.enforceRequest(createStoreRequest());

    expect(firstResult.type).toBe("allowed");
    expect(secondResult.type).toBe("allowed");
    expect(client.chargeCount).toBe(1);
    expect(client.evalCalls[0]?.keys[3]).toBe(client.evalCalls[1]?.keys[3]);
    expect(client.evalCalls[0]?.keys[3]).toContain("test-prefix:admission:");
  });

  it("does not double-charge when the first Redis reply is lost after charging", async () => {
    const client = new StatefulRedisClient({
      failOnceAfterCharging: true
    });
    const store = createRedisGovernanceStore({
      client,
      redis: createRedisConfig()
    });

    await expect(store.enforceRequest(createStoreRequest())).rejects.toBeInstanceOf(
      GovernanceStoreUnavailableError
    );

    const retryResult = await store.enforceRequest(createStoreRequest());

    expect(retryResult.type).toBe("allowed");
    expect(client.chargeCount).toBe(1);
  });

  it("uses a bounded admission dedupe TTL independent of monthly bucket rollover", async () => {
    const client = new StatefulRedisClient();
    const store = createRedisGovernanceStore({
      client,
      redis: createRedisConfig()
    });

    const firstResult = await store.enforceRequest(
      createStoreRequest({
        occurredAtMs: Date.UTC(2026, 0, 31, 23, 59, 0)
      })
    );
    const retryResult = await store.enforceRequest(
      createStoreRequest({
        occurredAtMs: Date.UTC(2026, 1, 1, 0, 1, 0)
      })
    );

    expect(firstResult.type).toBe("allowed");
    expect(retryResult.type).toBe("allowed");
    expect(client.chargeCount).toBe(1);
    expect(client.evalCalls[0]?.keys[2]).not.toBe(client.evalCalls[1]?.keys[2]);
    expect(client.evalCalls[0]?.keys[3]).toBe(client.evalCalls[1]?.keys[3]);
    expect(client.evalCalls[0]?.arguments[8]).toBe(
      GOVERNANCE_ADMISSION_DEDUPLICATION_TTL_MS.toString()
    );
    expect(client.evalCalls[1]?.arguments[8]).toBe(
      GOVERNANCE_ADMISSION_DEDUPLICATION_TTL_MS.toString()
    );
  });

  it("parses rate-limited Redis results with retry guidance", async () => {
    const store = createRedisGovernanceStore({
      client: new ScriptedRedisClient([["rate_limited", "1400"]]),
      redis: createRedisConfig()
    });

    const result = await store.enforceRequest(createStoreRequest());

    expect(result).toEqual({
      type: "rate_limited",
      retryAfterSeconds: 2
    });
  });

  it("parses quota and budget Redis results deterministically", async () => {
    const quotaStore = createRedisGovernanceStore({
      client: new ScriptedRedisClient([["daily_token_quota_exceeded"]]),
      redis: createRedisConfig()
    });
    const budgetStore = createRedisGovernanceStore({
      client: new ScriptedRedisClient([["monthly_budget_exceeded"]]),
      redis: createRedisConfig()
    });

    await expect(quotaStore.enforceRequest(createStoreRequest())).resolves.toEqual({
      type: "daily_token_quota_exceeded"
    });
    await expect(budgetStore.enforceRequest(createStoreRequest())).resolves.toEqual({
      type: "monthly_budget_exceeded"
    });
  });

  it("fails closed when Redis returns an invalid result", async () => {
    const store = createRedisGovernanceStore({
      client: new ScriptedRedisClient([["unexpected"]]),
      redis: createRedisConfig()
    });

    await expect(store.enforceRequest(createStoreRequest())).rejects.toBeInstanceOf(
      GovernanceStoreUnavailableError
    );
  });

  it("fails closed when Redis eval throws before returning a result", async () => {
    const store = createRedisGovernanceStore({
      client: new ScriptedRedisClient([new Error("Simulated Redis command failure.")]),
      redis: createRedisConfig()
    });

    await expect(store.enforceRequest(createStoreRequest())).rejects.toBeInstanceOf(
      GovernanceStoreUnavailableError
    );
  });
});

class StatefulRedisClient implements RedisLikeClient {
  public readonly evalCalls: Array<{
    readonly script: string;
    readonly keys: readonly string[];
    readonly arguments: readonly string[];
  }> = [];
  public chargeCount = 0;
  public readonly isOpen = true;
  private readonly admittedKeys = new Set<string>();
  private failOnceAfterCharging: boolean;
  private didFailAfterCharging = false;

  public constructor(options: { readonly failOnceAfterCharging?: boolean } = {}) {
    this.failOnceAfterCharging = options.failOnceAfterCharging ?? false;
  }

  public async eval(
    script: string,
    options: { readonly keys: readonly string[]; readonly arguments: readonly string[] }
  ): Promise<unknown> {
    this.evalCalls.push({
      script,
      keys: [...options.keys],
      arguments: [...options.arguments]
    });

    const admissionKey = options.keys[3] ?? "";
    const rateTtlMs = options.arguments[1] ?? "0";

    if (this.admittedKeys.has(admissionKey)) {
      return ["allowed", "1", rateTtlMs, "duplicate"];
    }

    this.admittedKeys.add(admissionKey);
    this.chargeCount += 1;

    if (this.failOnceAfterCharging && !this.didFailAfterCharging) {
      this.didFailAfterCharging = true;
      throw new Error("Simulated Redis reply loss.");
    }

    return ["allowed", "1", rateTtlMs];
  }

  public async quit(): Promise<void> {
    return;
  }
}

class ScriptedRedisClient implements RedisLikeClient {
  public readonly isOpen = true;
  private readonly responses: unknown[];

  public constructor(responses: unknown[]) {
    this.responses = [...responses];
  }

  public async eval(): Promise<unknown> {
    const response = this.responses.shift();

    if (response instanceof Error) {
      throw response;
    }

    return response;
  }

  public async quit(): Promise<void> {
    return;
  }
}

function createRedisConfig() {
  return {
    url: "redis://localhost:6379",
    keyPrefix: "test-prefix",
    connectTimeoutMs: 1_000
  } as const;
}

function createStoreRequest(overrides: Partial<GovernanceStoreRequest> = {}): GovernanceStoreRequest {
  return {
    apiKey: "test-api-key",
    admissionId: "chat_completion:req_test",
    occurredAtMs: Date.UTC(2026, 3, 24, 12, 0, 0),
    rateLimit: {
      maxRequests: 10,
      windowSeconds: 60
    },
    dailyTokenQuota: 1_000,
    monthlyBudgetLimitMinorUnits: 1_000,
    usageEstimate: {
      estimatedTokens: 5,
      estimatedCostMinorUnits: 2,
      totalCharacters: 20
    },
    ...overrides
  };
}
