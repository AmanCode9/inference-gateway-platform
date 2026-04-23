import type { OutgoingHttpHeaders, ServerResponse } from "node:http";

export interface ErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
  };
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: OutgoingHttpHeaders = {}
): void {
  const payload = JSON.stringify(body);

  response.writeHead(statusCode, {
    ...headers,
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json; charset=utf-8"
  });
  response.end(payload);
}

export function sendErrorResponse(
  response: ServerResponse,
  requestId: string,
  statusCode: number,
  code: string,
  message: string,
  headers: OutgoingHttpHeaders = {}
): void {
  sendJson(response, statusCode, {
    error: {
      code,
      message,
      requestId
    }
  } satisfies ErrorResponse, headers);
}
