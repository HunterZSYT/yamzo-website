import "server-only";

import { z } from "zod";

import { clientIp } from "./request-identity";

const verificationSchema = z.object({
  success: z.boolean(),
  action: z.string().optional(),
  hostname: z.string().optional(),
});

function allowedHostnames(): Set<string> {
  const configured = process.env.TURNSTILE_ALLOWED_HOSTNAMES
    ?.split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
  if (configured?.length) return new Set(configured);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    try {
      return new Set([new URL(siteUrl).hostname.toLowerCase()]);
    } catch {
      return new Set();
    }
  }

  return process.env.NODE_ENV === "development"
    ? new Set(["localhost", "127.0.0.1"])
    : new Set();
}

export async function verifyTurnstileAction(
  request: Request,
  token: string,
  expectedAction: "checkout" | "order_lookup",
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const hostnames = allowedHostnames();
  if (!secret || token.length === 0 || token.length > 2048 || hostnames.size === 0) {
    return false;
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          remoteip: clientIp(request),
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) return false;
    const parsed = verificationSchema.safeParse(await response.json());
    return Boolean(
        parsed.success &&
        parsed.data.success &&
        parsed.data.action === expectedAction &&
        parsed.data.hostname &&
        hostnames.has(parsed.data.hostname.toLowerCase()),
    );
  } catch {
    return false;
  }
}

export function verifyCheckoutTurnstile(
  request: Request,
  token: string,
): Promise<boolean> {
  return verifyTurnstileAction(request, token, "checkout");
}
