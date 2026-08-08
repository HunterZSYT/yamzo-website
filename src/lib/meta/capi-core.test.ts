import { describe, expect, it, vi } from "vitest";

import {
  buildMetaPurchasePayload,
  buildMetaUserData,
  sendMetaPurchaseEvent,
  sha256MetaValue,
} from "@/lib/meta/capi-core";
import type { MetaPurchaseClaim } from "@/lib/meta/contracts";

const claim: MetaPurchaseClaim = {
  outbox_id: 42,
  claim_token: "claim-token-used-only-for-contract-tests",
  attempt: 1,
  pixel_id: "123456789012345",
  access_token: "test-token-for-meta-runtime",
  event_id: "purchase-YZ-20260808-00000042",
  event_time: 1_786_182_400,
  order_reference: "YZ-20260808-00000042",
  user_id: "55555555-5555-4555-8555-555555555555",
  grand_total_minor: 44_000,
  currency_code: "BDT",
  full_name: "Yamzo Customer",
  phone_e164: "+8801712345678",
  contents: [
    {
      id: "menu_item_seafood_rice_bowl",
      quantity: 2,
      item_price_minor: 22_000,
    },
  ],
  num_items: 2,
};

describe("Meta CAPI payload", () => {
  it("hashes contact identifiers and never serializes their plaintext", () => {
    const userData = buildMetaUserData(claim);
    const payload = buildMetaPurchasePayload(
      claim,
      "https://yamzouttara.com/order-status",
    );
    const serialized = JSON.stringify(payload);

    expect(userData.ph).toEqual([sha256MetaValue("8801712345678")]);
    expect(userData.fn).toEqual([sha256MetaValue("yamzo")]);
    expect(userData.ln).toEqual([sha256MetaValue("customer")]);
    expect(serialized).not.toContain(claim.phone_e164);
    expect(serialized).not.toContain(claim.full_name);
    expect(serialized).not.toContain(claim.access_token);
    expect(payload.event_id).toBe(claim.event_id);
    expect(payload.custom_data.value).toBe(440);
  });

  it("marks delivery successful only when Meta acknowledges one event", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return ({
          ok: true,
          status: 200,
          json: async () => ({ events_received: 1 }),
        }) as Response;
      },
    );

    await expect(
      sendMetaPurchaseEvent(claim, {
        eventSourceUrl: "https://yamzouttara.com/order-status",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toBeUndefined();

    const [, request] = fetchImpl.mock.calls[0];
    expect(request?.headers).toMatchObject({
      authorization: `Bearer ${claim.access_token}`,
      "content-type": "application/json",
    });
    expect(request?.body).not.toContain(claim.access_token);
  });

  it("rejects an ambiguous HTTP 200 instead of losing the outbox event", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return ({
          ok: true,
          status: 200,
          json: async () => ({ events_received: 0 }),
        }) as Response;
      },
    );

    await expect(
      sendMetaPurchaseEvent(claim, {
        eventSourceUrl: "https://yamzouttara.com/order-status",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: "META_RESPONSE_INVALID",
    });
  });

  it("enforces the configured network timeout bound", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
    );

    await expect(
      sendMetaPurchaseEvent(claim, {
        eventSourceUrl: "https://yamzouttara.com/order-status",
        fetchImpl: fetchImpl as typeof fetch,
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({
      code: "META_TIMEOUT",
    });
  });
});
