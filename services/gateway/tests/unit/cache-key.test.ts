import { describe, expect, it } from "vitest";
import type { ChatCompletionRequest } from "../../src/chat/types.js";
import {
  EXACT_CHAT_CACHE_SCHEMA_VERSION,
  canonicalStringify,
  createExactChatCacheKey,
  parseExactChatCacheKey
} from "../../src/cache/key.js";

describe("createExactChatCacheKey", () => {
  it("uses the same key for the same normalized request", () => {
    const request = createRequest();

    expect(createExactChatCacheKey({ apiKey: "tenant-a", request })).toBe(
      createExactChatCacheKey({ apiKey: "tenant-a", request: createRequest() })
    );
  });

  it("uses the same key when JSON object property order differs", () => {
    const orderedRequest = createRequest();
    const differentlyOrderedRequest = {
      messages: [
        {
          content: "hello",
          role: "user"
        }
      ],
      model: "mock-model"
    } as ChatCompletionRequest;

    expect(createExactChatCacheKey({ apiKey: "tenant-a", request: orderedRequest })).toBe(
      createExactChatCacheKey({ apiKey: "tenant-a", request: differentlyOrderedRequest })
    );
  });

  it("uses different keys for different response-affecting fields", () => {
    const baseKey = createExactChatCacheKey({
      apiKey: "tenant-a",
      request: createRequest()
    });

    expect(
      createExactChatCacheKey({
        apiKey: "tenant-a",
        request: createRequest({
          model: "different-model"
        })
      })
    ).not.toBe(baseKey);
    expect(
      createExactChatCacheKey({
        apiKey: "tenant-a",
        request: createRequest({
          messages: [{ role: "assistant", content: "hello" }]
        })
      })
    ).not.toBe(baseKey);
    expect(
      createExactChatCacheKey({
        apiKey: "tenant-a",
        request: createRequest({
          messages: [{ role: "user", content: "different content" }]
        })
      })
    ).not.toBe(baseKey);
  });

  it("isolates identical payloads for different tenants", () => {
    const request = createRequest();

    expect(createExactChatCacheKey({ apiKey: "tenant-a", request })).not.toBe(
      createExactChatCacheKey({ apiKey: "tenant-b", request })
    );
  });

  it("does not include raw API keys in cache keys", () => {
    const cacheKey = createExactChatCacheKey({
      apiKey: "tenant-secret-api-key",
      request: createRequest()
    });

    expect(cacheKey).not.toContain("tenant-secret-api-key");
  });

  it("parses tenant hash and request fingerprint from exact cache keys", () => {
    const cacheKey = createExactChatCacheKey({
      apiKey: "tenant-a",
      request: createRequest()
    });

    expect(parseExactChatCacheKey(cacheKey)).toEqual({
      cachePolicyVersion: EXACT_CHAT_CACHE_SCHEMA_VERSION,
      tenantHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      exactCacheKey: cacheKey
    });
  });

  it("canonical stringification removes undefined object fields without mutating input", () => {
    const value = {
      b: 2,
      a: undefined,
      nested: {
        d: "kept",
        c: undefined
      }
    };

    expect(canonicalStringify(value)).toBe('{"b":2,"nested":{"d":"kept"}}');
    expect(Object.prototype.hasOwnProperty.call(value, "a")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(value.nested, "c")).toBe(true);
  });
});

function createRequest(overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest {
  return {
    model: "mock-model",
    messages: [{ role: "user", content: "hello" }],
    ...overrides
  };
}
