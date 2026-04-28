import { describe, expect, it } from "vitest";
import type { ChatCompletionRequest } from "../../src/chat/types.js";
import { buildChatCompletionEmbeddingInput } from "../../src/embeddings/embedding-input.js";

describe("buildChatCompletionEmbeddingInput", () => {
  it("builds the same input for the same validated request", () => {
    expect(buildChatCompletionEmbeddingInput(createRequest())).toBe(
      buildChatCompletionEmbeddingInput(createRequest())
    );
  });

  it("preserves message order", () => {
    const first = buildChatCompletionEmbeddingInput(
      createRequest({
        messages: [
          { role: "system", content: "Be concise." },
          { role: "user", content: "Explain APIPA." }
        ]
      })
    );
    const second = buildChatCompletionEmbeddingInput(
      createRequest({
        messages: [
          { role: "user", content: "Explain APIPA." },
          { role: "system", content: "Be concise." }
        ]
      })
    );

    expect(first).not.toBe(second);
  });

  it("changes when semantic message content changes", () => {
    expect(buildChatCompletionEmbeddingInput(createRequest())).not.toBe(
      buildChatCompletionEmbeddingInput(
        createRequest({
          messages: [{ role: "user", content: "Explain DNS." }]
        })
      )
    );
  });

  it("includes message roles", () => {
    const input = buildChatCompletionEmbeddingInput(createRequest());

    expect(input).toContain('"role":"user"');
    expect(input).toContain('"content":"Explain APIPA."');
  });

  it("excludes request-scoped and tenant metadata", () => {
    const input = buildChatCompletionEmbeddingInput(createRequest());

    expect(input).not.toContain("req_");
    expect(input).not.toContain("x-request-id");
    expect(input).not.toContain("tenant-api-key");
    expect(input).not.toContain("cache_key");
  });

  it("does not mutate the original request", () => {
    const request = createRequest();
    const before = JSON.stringify(request);

    buildChatCompletionEmbeddingInput(request);

    expect(JSON.stringify(request)).toBe(before);
  });
});

function createRequest(overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest {
  return {
    model: "mock-model",
    messages: [{ role: "user", content: "Explain APIPA." }],
    ...overrides
  };
}
