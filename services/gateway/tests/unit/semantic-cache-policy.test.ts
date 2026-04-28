import { describe, expect, it } from "vitest";
import {
  createSemanticInputHash,
  evaluateSemanticCacheEligibility
} from "../../src/cache/semantic-policy.js";

describe("evaluateSemanticCacheEligibility", () => {
  it("accepts safe single-turn user requests", () => {
    const eligibility = evaluateSemanticCacheEligibility({
      model: "mock-model",
      messages: [{ role: "user", content: "Explain subnet masks simply" }]
    });

    expect(eligibility).toEqual({
      eligible: true
    });
  });

  it("allows a stable system prompt and hashes it for compatibility", () => {
    const first = evaluateSemanticCacheEligibility({
      model: "mock-model",
      messages: [
        { role: "system", content: "Answer tersely." },
        { role: "user", content: "Explain DNS simply" }
      ]
    });
    const second = evaluateSemanticCacheEligibility({
      model: "mock-model",
      messages: [
        { role: "system", content: "Answer tersely." },
        { role: "user", content: "Explain DNS simply" }
      ]
    });

    expect(first.eligible).toBe(true);
    expect(first.systemPromptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.systemPromptHash).toBe(second.systemPromptHash);
  });

  it("rejects assistant-history and multi-turn requests", () => {
    const eligibility = evaluateSemanticCacheEligibility({
      model: "mock-model",
      messages: [
        { role: "user", content: "Explain DNS" },
        { role: "assistant", content: "DNS resolves names." },
        { role: "user", content: "Expand that answer" }
      ]
    });

    expect(eligibility).toMatchObject({
      eligible: false,
      reason: "unsupported_request_shape"
    });
  });

  it("rejects freshness, sensitive, and context-dependent prompts", () => {
    for (const content of [
      "What is the latest weather?",
      "Summarize the attached file",
      "Store my API key safely",
      "Give me medical advice"
    ]) {
      const eligibility = evaluateSemanticCacheEligibility({
        model: "mock-model",
        messages: [{ role: "user", content }]
      });

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toMatch(/^risk_indicator:/);
    }
  });
});

describe("createSemanticInputHash", () => {
  it("creates a deterministic SHA-256 hash", () => {
    expect(createSemanticInputHash("stable input")).toBe(createSemanticInputHash("stable input"));
    expect(createSemanticInputHash("stable input")).not.toBe(createSemanticInputHash("different input"));
    expect(createSemanticInputHash("stable input")).toMatch(/^[a-f0-9]{64}$/);
  });
});
