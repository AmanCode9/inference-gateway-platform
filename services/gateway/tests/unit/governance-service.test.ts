import { describe, expect, it } from "vitest";
import { validateChatCompletionRequest } from "../../src/chat/validation.js";
import { loadConfig } from "../../src/config/index.js";
import { createGovernanceService } from "../../src/governance/service.js";
import type {
  GovernanceStore,
  GovernanceStoreRequest,
  GovernanceStoreResult
} from "../../src/governance/types.js";
import type { Logger } from "../../src/logging/logger.js";

describe("createGovernanceService", () => {
  it("uses the same admission id for the same request id and normalized payload", async () => {
    const store = new RecordingGovernanceStore();
    const service = createGovernanceService({
      config: createGovernanceConfig(),
      store
    });
    const firstRequest = validateChatCompletionRequest({
      model: " mock-model ",
      messages: [{ role: "user", content: " hello " }]
    });
    const secondRequest = validateChatCompletionRequest({
      model: "mock-model",
      messages: [{ role: "user", content: "hello" }],
      ignoredByCurrentContract: true
    });

    await service.admitChatCompletion(firstRequest, createContext("req_same_payload"));
    await service.admitChatCompletion(secondRequest, createContext("req_same_payload"));

    expect(store.requests).toHaveLength(2);
    expect(store.requests[0]?.admissionId).toBe(store.requests[1]?.admissionId);
  });

  it("uses different admission ids for the same request id with different normalized payloads", async () => {
    const store = new RecordingGovernanceStore();
    const service = createGovernanceService({
      config: createGovernanceConfig(),
      store
    });
    const firstRequest = validateChatCompletionRequest({
      model: "mock-model",
      messages: [{ role: "user", content: "first payload" }]
    });
    const secondRequest = validateChatCompletionRequest({
      model: "mock-model",
      messages: [{ role: "user", content: "second payload" }]
    });

    await service.admitChatCompletion(firstRequest, createContext("req_reused_id"));
    await service.admitChatCompletion(secondRequest, createContext("req_reused_id"));

    expect(store.requests).toHaveLength(2);
    expect(store.requests[0]?.admissionId).not.toBe(store.requests[1]?.admissionId);
  });
});

class RecordingGovernanceStore implements GovernanceStore {
  public readonly requests: GovernanceStoreRequest[] = [];

  public async enforceRequest(request: GovernanceStoreRequest): Promise<GovernanceStoreResult> {
    this.requests.push(request);

    return {
      type: "allowed",
      remainingRequests: 99,
      retryAfterSeconds: 60
    };
  }

  public async close(): Promise<void> {
    return;
  }
}

function createGovernanceConfig() {
  return loadConfig({
    GATEWAY_API_KEY: "test-gateway-key",
    REDIS_URL: "redis://localhost:6379"
  }).governance;
}

function createContext(requestId: string) {
  return {
    apiKey: "test-gateway-key",
    requestId,
    logger: createNoopLogger()
  };
}

function createNoopLogger(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => createNoopLogger()
  };
}
