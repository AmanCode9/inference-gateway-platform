import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { GatewayConfig } from "../../config/index.js";
import { unauthorized } from "../errors.js";

export function requireApiKey(request: IncomingMessage, config: Pick<GatewayConfig, "apiKey">): void {
  const suppliedApiKey = readApiKeyHeader(request);

  if (!suppliedApiKey || !timingSafeCompare(suppliedApiKey, config.apiKey)) {
    throw unauthorized();
  }
}

function readApiKeyHeader(request: IncomingMessage): string | undefined {
  const rawHeaderValues = getRawHeaderValues(request, "x-api-key");

  if (rawHeaderValues.length > 1) {
    throw unauthorized("Ambiguous x-api-key header values are not allowed.");
  }

  const headerValues =
    rawHeaderValues.length === 1
      ? readSingleRawHeaderValue(rawHeaderValues[0])
      : normalizeHeaderValue(request.headers["x-api-key"]);

  if (headerValues.length > 1) {
    throw unauthorized("Ambiguous x-api-key header values are not allowed.");
  }

  return headerValues[0];
}

function getRawHeaderValues(request: IncomingMessage, headerName: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === headerName) {
      values.push(request.rawHeaders[index + 1] ?? "");
    }
  }

  return values;
}

function readSingleRawHeaderValue(value: string | undefined): string[] {
  return value === undefined ? [] : splitHeaderValue(value);
}

function normalizeHeaderValue(value: string | readonly string[] | undefined): string[] {
  if (typeof value === "string") {
    return splitHeaderValue(value);
  }

  if (Array.isArray(value)) {
    return value.flatMap(splitHeaderValue);
  }

  return [];
}

function splitHeaderValue(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function timingSafeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
