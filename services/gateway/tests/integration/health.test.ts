import { afterEach, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./test-server.js";

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("GET /health", () => {
  it("returns the gateway health status", async () => {
    server = await startTestServer();
    const response = await fetch(server.url("/health"));
    const body = (await response.json()) as {
      status?: string;
      service?: string;
      version?: string;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      service: "inference-gateway",
      version: "0.1.0"
    });
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
