import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";
import type { ZodError } from "zod";

const MAX_JSON_BYTES = 32 * 1024;

export class RequestContractError extends Error {
  constructor(
    readonly status: 400 | 403 | 413 | 415,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RequestContractError";
  }
}

function responseHeaders(requestId: string): HeadersInit {
  return {
    "cache-control": "private, no-store, max-age=0",
    expires: "0",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  };
}

export function privateJson(
  body: unknown,
  init: { status: number; requestId: string; headers?: HeadersInit },
) {
  const headers = new Headers(responseHeaders(init.requestId));
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  return NextResponse.json(body, { status: init.status, headers });
}

export function assertSameOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new RequestContractError(
      403,
      "CROSS_SITE_REQUEST_REJECTED",
      "This request must come from the Yamzo website.",
    );
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new RequestContractError(
      403,
      "CROSS_SITE_REQUEST_REJECTED",
      "This request must come from the Yamzo website.",
    );
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new RequestContractError(
      415,
      "JSON_REQUIRED",
      "Send this request as JSON.",
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_JSON_BYTES) {
    throw new RequestContractError(
      413,
      "REQUEST_TOO_LARGE",
      "The order request is too large.",
    );
  }

  const source = await request.text();
  if (new TextEncoder().encode(source).byteLength > MAX_JSON_BYTES) {
    throw new RequestContractError(
      413,
      "REQUEST_TOO_LARGE",
      "The order request is too large.",
    );
  }

  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new RequestContractError(
      400,
      "INVALID_JSON",
      "The request body is not valid JSON.",
    );
  }
}

export function requestContractErrorResponse(
  error: RequestContractError,
  requestId: string,
) {
  return privateJson(
    { error: error.code, message: error.message, requestId },
    { status: error.status, requestId },
  );
}

export function zodErrorResponse(error: ZodError, requestId: string) {
  const issue = error.issues[0];
  return privateJson(
    {
      error: "INVALID_REQUEST",
      message: issue?.message ?? "Check the order details and try again.",
      field: issue?.path.join(".") || undefined,
      requestId,
    },
    { status: 400, requestId },
  );
}

const databaseErrors: Record<
  string,
  { status: number; code: string; message: string }
> = {
  AUTHENTICATION_REQUIRED: {
    status: 401,
    code: "AUTHENTICATION_REQUIRED",
    message: "Sign in to continue.",
  },
  TEST_MODE_REQUIRES_APPROVED_STAFF: {
    status: 403,
    code: "STAFF_PREVIEW_REQUIRED",
    message: "Test orders are available only to approved Yamzo staff.",
  },
  IDEMPOTENCY_KEY_REUSED: {
    status: 409,
    code: "IDEMPOTENCY_KEY_REUSED",
    message: "This order request conflicts with an earlier attempt.",
  },
  CATALOG_SUBTOTAL_CHANGED: {
    status: 409,
    code: "CATALOG_SUBTOTAL_CHANGED",
    message: "The menu price changed. Review your cart and try again.",
  },
  ITEM_NOT_AVAILABLE: {
    status: 409,
    code: "ITEM_NOT_AVAILABLE",
    message: "One of those items is no longer available.",
  },
  MODIFIER_NOT_AVAILABLE_FOR_ITEM: {
    status: 409,
    code: "ITEM_OPTIONS_CHANGED",
    message: "One of those item options is no longer available.",
  },
  MODIFIER_SELECTION_REQUIREMENTS_NOT_MET: {
    status: 409,
    code: "ITEM_OPTIONS_CHANGED",
    message: "Choose the required options for each item.",
  },
  SECTOR_NOT_AVAILABLE: {
    status: 409,
    code: "SECTOR_NOT_AVAILABLE",
    message: "Delivery is not currently available in that Uttara sector.",
  },
  MINIMUM_ORDER_NOT_MET: {
    status: 409,
    code: "MINIMUM_ORDER_NOT_MET",
    message: "Add a little more to meet the current minimum order.",
  },
  ORDERING_NOT_AVAILABLE: {
    status: 503,
    code: "ORDERING_NOT_AVAILABLE",
    message: "Online ordering is not available right now.",
  },
  ORDERING_OUTSIDE_BUSINESS_HOURS: {
    status: 409,
    code: "ORDERING_OUTSIDE_BUSINESS_HOURS",
    message: "Yamzo is currently closed for online orders.",
  },
  SITE_RUNTIME_NOT_CONFIGURED: {
    status: 503,
    code: "ORDERING_NOT_AVAILABLE",
    message: "Online ordering is not available right now.",
  },
  RATE_LIMITED: {
    status: 429,
    code: "RATE_LIMITED",
    message: "Too many attempts. Please wait and try again.",
  },
};

export function databaseErrorResponse(
  error: Pick<PostgrestError, "code" | "message">,
  requestId: string,
) {
  if (error.message === "ORDER_NOT_FOUND" || error.code === "PGRST116") {
    return privateJson(
      {
        error: "ORDER_NOT_FOUND",
        message: "We could not find that order.",
        requestId,
      },
      { status: 404, requestId },
    );
  }

  const known = databaseErrors[error.message];
  if (known) {
    const headers = known.status === 429 ? { "retry-after": "600" } : undefined;
    return privateJson(
      { error: known.code, message: known.message, requestId },
      { status: known.status, requestId, headers },
    );
  }

  const unavailable = error.code.startsWith("PGRST") || error.code === "57014";
  return privateJson(
    {
      error: unavailable ? "ORDER_SERVICE_UNAVAILABLE" : "ORDER_REQUEST_FAILED",
      message: unavailable
        ? "Order service is temporarily unavailable. Please try again."
        : "We could not complete that order request.",
      requestId,
    },
    { status: unavailable ? 503 : 500, requestId },
  );
}

export function internalErrorResponse(requestId: string) {
  return privateJson(
    {
      error: "ORDER_REQUEST_FAILED",
      message: "We could not complete that order request.",
      requestId,
    },
    { status: 500, requestId },
  );
}
