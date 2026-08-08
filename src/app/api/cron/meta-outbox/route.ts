import { timingSafeEqual } from "node:crypto";

import { dispatchPendingMetaPurchases } from "@/lib/meta/capi-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json(
      { error: "NOT_FOUND" },
      {
        status: 404,
        headers: { "cache-control": "private, no-store, max-age=0" },
      },
    );
  }

  const summary = await dispatchPendingMetaPurchases({ limit: 10 });
  return Response.json(summary, {
    status: 200,
    headers: { "cache-control": "private, no-store, max-age=0" },
  });
}

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret) return false;

  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(authorization, "utf8");
  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}
