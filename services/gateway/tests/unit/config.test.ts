import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";

describe("loadConfig", () => {
  it("loads defaults for optional environment variables", () => {
    const config = loadConfig({});

    expect(config).toMatchObject({
      nodeEnv: "development",
      port: 3000,
      serviceName: "inference-gateway",
      serviceVersion: "0.1.0",
      logLevel: "info",
      maxRequestBytes: 1_048_576
    });
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ PORT: "99999" })).toThrow("PORT must be an integer");
  });
});
