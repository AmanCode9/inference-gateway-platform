import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("gateway OpenAPI contract", () => {
  it("documents request-side x-request-id governance idempotency behavior", () => {
    const contract = readFileSync(
      new URL("../../../../openapi/gateway.openapi.yaml", import.meta.url),
      "utf8"
    );

    expect(contract).toContain("name: x-request-id");
    expect(contract).toContain("governance idempotency");
    expect(contract).toContain("same normalized payload");
    expect(contract).toContain("different normalized payload");
    expect(contract).toContain("24 hours");
  });

  it("documents cache status response headers", () => {
    const contract = readFileSync(
      new URL("../../../../openapi/gateway.openapi.yaml", import.meta.url),
      "utf8"
    );

    expect(contract).toContain("x-cache-status");
    expect(contract).toContain("hit-exact");
    expect(contract).toContain("hit-semantic");
    expect(contract).toContain("bypass");
  });
});
