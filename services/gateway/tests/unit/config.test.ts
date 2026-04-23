import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";

describe("loadConfig", () => {
  it("loads defaults for optional environment variables", () => {
    const config = loadConfig({ GATEWAY_API_KEY: "test-key" });

    expect(config).toMatchObject({
      nodeEnv: "development",
      port: 3000,
      serviceName: "inference-gateway",
      serviceVersion: "0.1.0",
      logLevel: "info",
      maxRequestBytes: 1_048_576,
      apiKey: "test-key"
    });
    expect(config.routing).toMatchObject({
      primaryProviderId: "mock",
      timeoutMs: 1_000,
      maxRetries: 1,
      retryBackoffMs: 50
    });
    expect(config.providerRegistry).toHaveLength(1);
    expect(config.providerRegistry[0]).toMatchObject({
      id: "mock",
      kind: "mock",
      behavior: "success"
    });
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ GATEWAY_API_KEY: "test-key", PORT: "99999" })).toThrow(
      "PORT must be an integer"
    );
  });

  it("requires a non-blank gateway API key", () => {
    expect(() => loadConfig({ GATEWAY_API_KEY: "   " })).toThrow("GATEWAY_API_KEY is required.");
  });

  it("rejects comma-containing gateway API keys at startup", () => {
    expect(() => loadConfig({ GATEWAY_API_KEY: "alpha,beta" })).toThrow(
      "GATEWAY_API_KEY must not contain commas."
    );
  });

  it("requires real provider settings when the stub adapter is configured", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        PRIMARY_PROVIDER_KIND: "real_stub"
      })
    ).toThrow("PRIMARY_REAL_PROVIDER_NAME is required.");
  });

  it("rejects duplicate provider IDs across routing slots", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        PRIMARY_PROVIDER_ID: "provider-a",
        SECONDARY_PROVIDER_KIND: "mock",
        SECONDARY_PROVIDER_ID: "provider-a"
      })
    ).toThrow("Provider IDs must be unique.");
  });

  it("rejects partial secondary provider configuration", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        SECONDARY_PROVIDER_ID: "backup-provider"
      })
    ).toThrow("SECONDARY_PROVIDER_KIND is required when secondary provider settings are present.");
  });

  it("rejects invalid timeout settings", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        PROVIDER_TIMEOUT_MS: "0"
      })
    ).toThrow("PROVIDER_TIMEOUT_MS must be an integer");
  });
});
