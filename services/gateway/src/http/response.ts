import type { ServerResponse } from "node:http";

export interface ErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);

  response.writeHead(statusCode, {
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json; charset=utf-8"
  });
  response.end(payload);
}

export function sendError(response: ServerResponse, statusCode: number, code: string, message: string): void {
  sendJson(response, statusCode, {
    error: {
      code,
      message
    }
  } satisfies ErrorResponse);
}

export function sendMethodNotAllowed(response: ServerResponse, allowedMethods: readonly string[]): void {
  response.setHeader("allow", allowedMethods.join(", "));
  sendError(response, 405, "method_not_allowed", "Method not allowed.");
}
