import { describe, expect, it } from "vitest";
import { createInMemoryGovernanceStore } from "../../src/governance/in-memory-store.js";
import type { GovernanceStoreRequest } from "../../src/governance/types.js";

describe("createInMemoryGovernanceStore", () => {
  it("keeps admission dedupe across UTC month rollover within the retry window", async () => {
    const store = createInMemoryGovernanceStore();
    const firstResult = await store.enforceRequest(
      createStoreRequest({
        occurredAtMs: Date.UTC(2026, 0, 31, 23, 59, 0),
        dailyTokenQuota: 5
      })
    );
    const retryResult = await store.enforceRequest(
      createStoreRequest({
        occurredAtMs: Date.UTC(2026, 1, 1, 0, 1, 0),
        dailyTokenQuota: 5
      })
    );
    const distinctResult = await store.enforceRequest(
      createStoreRequest({
        admissionId: "chat_completion:req_rollover:distinct",
        occurredAtMs: Date.UTC(2026, 1, 1, 0, 2, 0),
        dailyTokenQuota: 5
      })
    );

    expect(firstResult.type).toBe("allowed");
    expect(retryResult.type).toBe("allowed");
    expect(distinctResult.type).toBe("allowed");
  });

  it("expires admission dedupe after the bounded retry window", async () => {
    const store = createInMemoryGovernanceStore();
    const firstResult = await store.enforceRequest(
      createStoreRequest({
        occurredAtMs: Date.UTC(2026, 0, 1, 0, 0, 0),
        monthlyBudgetLimitMinorUnits: 5
      })
    );
    const retryAfterWindowResult = await store.enforceRequest(
      createStoreRequest({
        occurredAtMs: Date.UTC(2026, 0, 2, 0, 0, 1),
        monthlyBudgetLimitMinorUnits: 5
      })
    );

    expect(firstResult.type).toBe("allowed");
    expect(retryAfterWindowResult.type).toBe("monthly_budget_exceeded");
  });
});

function createStoreRequest(overrides: Partial<GovernanceStoreRequest> = {}): GovernanceStoreRequest {
  return {
    apiKey: "test-api-key",
    admissionId: "chat_completion:req_rollover",
    occurredAtMs: Date.UTC(2026, 0, 31, 23, 59, 0),
    rateLimit: {
      maxRequests: 100,
      windowSeconds: 60
    },
    dailyTokenQuota: 1_000,
    monthlyBudgetLimitMinorUnits: 1_000,
    usageEstimate: {
      estimatedTokens: 5,
      estimatedCostMinorUnits: 5,
      totalCharacters: 20
    },
    ...overrides
  };
}
