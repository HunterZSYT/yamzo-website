import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockPosRequestError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }

  return {
    MockPosRequestError,
    readPosJsonBody: vi.fn(),
    authenticatePosRequest: vi.fn(),
    rpc: vi.fn(),
    schema: vi.fn(),
  };
});

vi.mock("@/lib/pos/http", () => ({
  PosRequestError: mocks.MockPosRequestError,
  authenticatePosRequest: mocks.authenticatePosRequest,
  posErrorResponse: (error: unknown, requestId: string) => {
    const known = error instanceof mocks.MockPosRequestError;
    const invalidRequest = Boolean(
      error
      && typeof error === "object"
      && "issues" in error,
    );
    return Response.json(
      {
        error: known || invalidRequest
          ? known ? error.code : "INVALID_POS_REQUEST"
          : "POS_SERVICE_UNAVAILABLE",
        requestId,
      },
      { status: known ? error.status : invalidRequest ? 400 : 503 },
    );
  },
  posJson: (body: unknown, init: { status: number; requestId: string }) =>
    Response.json(body, {
      status: init.status,
      headers: { "x-request-id": init.requestId },
    }),
  posRequestId: () => "test-request-id",
  readPosJsonBody: mocks.readPosJsonBody,
  throwPosDatabaseError: (error: { message: string }) => {
    throw new mocks.MockPosRequestError(503, error.message, "Database error");
  },
}));

import { POST } from "./route";

const order = {
  order_id: "7c4fdac0-687f-4a34-a143-f16c5f7e7833",
  order_reference: "YZ-20260809-00000001",
  mode: "live",
  status: "pending_acceptance",
  version: 1,
  locale: "en",
  subtotal_minor: 27_500,
  discount_minor: 0,
  delivery_fee_minor: 3_000,
  grand_total_minor: 30_500,
  currency_code: "BDT",
  customer_note: null,
  placed_at: "2026-08-09T09:00:00.000Z",
  accepted_at: null,
  completed_at: null,
  cancelled_at: null,
  archived_at: null,
  updated_at: "2026-08-09T09:00:00.000Z",
  contact: {
    full_name: "Test Customer",
    phone_e164: "+8801712345678",
    sector_number: 11,
    road_number: "20",
    house_number: "80",
    flat_number: "4B",
  },
  items: [
    {
      id: "c6598852-e7b3-47c7-9342-63fabf48008c",
      source_item_id: null,
      source_item_public_key: null,
      source_item_slug: null,
      name_en: "Chicken Momo",
      name_bn: "চিকেন মোমো",
      quantity: 1,
      unit_price_minor: 27_500,
      modifier_unit_total_minor: 0,
      effective_unit_price_minor: 27_500,
      line_total_minor: 27_500,
      customer_note: null,
      modifiers: [],
    },
  ],
};

describe("POST /api/pos/orders/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.schema.mockReturnValue({ rpc: mocks.rpc });
    mocks.authenticatePosRequest.mockResolvedValue({
      admin: { schema: mocks.schema },
      terminalId: "8e2ea890-833b-4a94-b261-7caab1ec8709",
      requestId: "test-request-id",
    });
    mocks.rpc.mockResolvedValue({ data: [order], error: null });
  });

  it("authenticates the terminal and forwards the decoded opaque cursor to the service RPC", async () => {
    const body = JSON.stringify({
      cursor: Buffer.from(JSON.stringify({
        updatedAt: "2026-08-09T08:59:00.000Z",
        orderId: "f4ccf5db-5480-4d6d-9b2c-d1d95f930000",
      }), "utf8").toString("base64url"),
      limit: 1,
      includeTest: true,
    });
    mocks.readPosJsonBody.mockResolvedValue({ rawBody: body, value: JSON.parse(body) });

    const response = await POST(new Request("https://yamzouttara.com/api/pos/orders/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }));

    expect(response.status).toBe(200);
    expect(mocks.authenticatePosRequest).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("pos_sync_website_orders", {
      p_terminal_id: "8e2ea890-833b-4a94-b261-7caab1ec8709",
      p_limit: 1,
      p_include_test: true,
      p_after_updated_at: "2026-08-09T08:59:00.000Z",
      p_after_order_id: "f4ccf5db-5480-4d6d-9b2c-d1d95f930000",
    });
    await expect(response.json()).resolves.toMatchObject({
      orders: [{ order_id: order.order_id, status: "pending_acceptance" }],
      nextCursor: expect.any(String),
    });
  });

  it("rejects a malformed cursor before any database call", async () => {
    const body = JSON.stringify({ cursor: "not-a-valid-cursor" });
    mocks.readPosJsonBody.mockResolvedValue({ rawBody: body, value: JSON.parse(body) });

    const response = await POST(new Request("https://yamzouttara.com/api/pos/orders/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "INVALID_POS_REQUEST",
      requestId: "test-request-id",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a sync request above the explicit 50-order ceiling", async () => {
    const body = JSON.stringify({ limit: 51 });
    mocks.readPosJsonBody.mockResolvedValue({ rawBody: body, value: JSON.parse(body) });

    const response = await POST(new Request("https://yamzouttara.com/api/pos/orders/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "INVALID_POS_REQUEST",
      requestId: "test-request-id",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
