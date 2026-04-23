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
      apiKey: "test-key",
      providerKind: "mock"
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
        PROVIDER_KIND: "real_stub"
      })
    ).toThrow("REAL_PROVIDER_NAME is required.");
  });
});
