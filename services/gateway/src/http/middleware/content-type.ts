import type { IncomingMessage } from "node:http";
import { unsupportedMediaType } from "../errors.js";

export function requireJsonContentType(request: IncomingMessage): void {
  const contentType = normalizeContentType(request.headers["content-type"]);

  if (contentType !== "application/json") {
    throw unsupportedMediaType();
  }
}

function normalizeContentType(value: string | readonly string[] | undefined): string | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue) {
    return undefined;
  }

  return rawValue.split(";", 1)[0]?.trim().toLowerCase();
}
