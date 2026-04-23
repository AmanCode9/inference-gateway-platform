import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppDependencies } from "../app.js";

export interface RequestContext extends AppDependencies {
  readonly requestId: string;
  readonly startedAt: number;
  readonly path: string;
}

export function createRequestContext(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: AppDependencies
): RequestContext {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const requestId = resolveRequestId(request.headers["x-request-id"]);

  response.setHeader("x-request-id", requestId);

  return {
    ...dependencies,
    requestId,
    startedAt: Date.now(),
    path,
    logger: dependencies.logger.child({
      requestId,
      method: request.method ?? "UNKNOWN",
      path
    })
  };
}

function resolveRequestId(value: string | readonly string[] | undefined): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const firstValue = value.find((entry) => entry.trim().length > 0);

    if (firstValue) {
      return firstValue.trim();
    }
  }

  return `req_${randomUUID()}`;
}
