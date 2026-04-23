import type { IncomingMessage } from "node:http";

export class RequestBodyError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  public constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "RequestBodyError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request as AsyncIterable<Buffer | string>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      throw new RequestBodyError(413, "request_too_large", "Request body is too large.");
    }

    chunks.push(buffer);
  }

  if (totalBytes === 0) {
    throw new RequestBodyError(400, "invalid_json", "Request body is required.");
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RequestBodyError(400, "invalid_json", "Request body must be valid JSON.");
  }
}
