import "server-only";

import { createHmac } from "node:crypto";

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    (process.env.NODE_ENV === "development" ? "127.0.0.1" : "unavailable");
}

export function rateBucket(request: Request, action: string): string {
  const secret = process.env.YAMZO_RATE_LIMIT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      return `local-development:${action}`;
    }
    throw new Error("Server rate-limit identity is not configured.");
  }

  return createHmac("sha256", secret)
    .update(`${action}\0${clientIp(request)}`)
    .digest("base64url");
}
