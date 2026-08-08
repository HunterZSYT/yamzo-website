import { createHash } from "node:crypto";

import type { MetaPurchaseClaim } from "@/lib/meta/contracts";

const DEFAULT_META_GRAPH_VERSION = "v25.0";
const DEFAULT_META_TIMEOUT_MS = 2_000;

export type MetaDispatchErrorCode =
  | "META_TIMEOUT"
  | "META_NETWORK_ERROR"
  | "META_HTTP_4XX"
  | "META_HTTP_5XX"
  | "META_RESPONSE_INVALID";

export class MetaDispatchError extends Error {
  constructor(readonly code: MetaDispatchErrorCode) {
    super("Meta conversion delivery failed.");
    this.name = "MetaDispatchError";
  }
}

export function sha256MetaValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeMetaName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function buildMetaUserData(claim: MetaPurchaseClaim) {
  const names = claim.full_name
    .normalize("NFKC")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  const firstName = normalizeMetaName(names[0] ?? "");
  const lastName = normalizeMetaName(names.at(-1) ?? names[0] ?? "");
  const phone = claim.phone_e164.replace(/\D/g, "");

  if (!/^8801[3-9]\d{8}$/.test(phone) || !firstName || !lastName) {
    throw new MetaDispatchError("META_RESPONSE_INVALID");
  }

  return {
    ph: [sha256MetaValue(phone)],
    fn: [sha256MetaValue(firstName)],
    ln: [sha256MetaValue(lastName)],
    country: [sha256MetaValue("bd")],
    ...(claim.user_id
      ? { external_id: [sha256MetaValue(claim.user_id.toLowerCase())] }
      : {}),
  };
}

export function buildMetaPurchasePayload(
  claim: MetaPurchaseClaim,
  eventSourceUrl: string,
) {
  return {
    event_name: "Purchase",
    event_time: claim.event_time,
    event_id: claim.event_id,
    action_source: "website",
    event_source_url: eventSourceUrl,
    user_data: buildMetaUserData(claim),
    custom_data: {
      currency: claim.currency_code,
      value: claim.grand_total_minor / 100,
      order_id: claim.order_reference,
      content_type: "product",
      content_ids: claim.contents.map((item) => item.id),
      contents: claim.contents.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        item_price: item.item_price_minor / 100,
      })),
      num_items: claim.num_items,
    },
  };
}

export async function sendMetaPurchaseEvent(
  claim: MetaPurchaseClaim,
  options: {
    eventSourceUrl: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    graphVersion?: string;
  },
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_META_TIMEOUT_MS;
  const graphVersion = options.graphVersion ?? DEFAULT_META_GRAPH_VERSION;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 5_000 ||
    !/^v\d{1,2}\.0$/.test(graphVersion)
  ) {
    throw new MetaDispatchError("META_RESPONSE_INVALID");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(
      `https://graph.facebook.com/${graphVersion}/${claim.pixel_id}/events`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${claim.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          data: [buildMetaPurchasePayload(claim, options.eventSourceUrl)],
        }),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new MetaDispatchError(
        response.status >= 500 ? "META_HTTP_5XX" : "META_HTTP_4XX",
      );
    }

    const responsePayload: unknown = await response.json().catch(() => null);
    if (!isAcceptedMetaResponse(responsePayload)) {
      throw new MetaDispatchError("META_RESPONSE_INVALID");
    }
  } catch (error) {
    if (error instanceof MetaDispatchError) throw error;
    if (controller.signal.aborted) {
      throw new MetaDispatchError("META_TIMEOUT");
    }
    throw new MetaDispatchError("META_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}

function isAcceptedMetaResponse(
  value: unknown,
): value is { events_received: 1 } {
  return (
    typeof value === "object" &&
    value !== null &&
    "events_received" in value &&
    value.events_received === 1
  );
}

export function metaDispatchErrorCode(error: unknown): MetaDispatchErrorCode {
  return error instanceof MetaDispatchError
    ? error.code
    : "META_NETWORK_ERROR";
}
