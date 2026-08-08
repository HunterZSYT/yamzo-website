import { randomUUID } from "node:crypto";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  sha256HexSchema,
  posTerminalVerifierSchema,
  terminalCodeSchema,
  terminalNonceSchema,
  terminalSignatureSchema,
  unixTimestampSchema,
} from "@/lib/pos/api-contract";
import {
  buildPosSignatureCanonical,
  safeEqualHex,
  sha256Hex,
  verifyPosSignature,
} from "@/lib/pos/signing";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_POS_JSON_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;

export class PosRequestError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PosRequestError";
  }
}

export interface AuthenticatedPosRequest {
  admin: SupabaseClient;
  terminalId: string;
  requestId: string;
}

export function posRequestId(): string {
  return randomUUID();
}

export async function readPosJsonBody(
  request: Request,
): Promise<{ rawBody: string; value: unknown }> {
  const contentType = request.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase() ?? "";
  const contentEncoding = request.headers.get("content-encoding")
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json" || (contentEncoding && contentEncoding !== "identity")) {
    throw new PosRequestError(415, "JSON_REQUIRED", "Send this request as JSON.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_POS_JSON_BYTES) {
    throw new PosRequestError(413, "REQUEST_TOO_LARGE", "The POS request is too large.");
  }

  const rawBody = await readBoundedUtf8Body(request);

  try {
    return { rawBody, value: JSON.parse(rawBody) as unknown };
  } catch {
    throw new PosRequestError(400, "INVALID_JSON", "The POS request is not valid JSON.");
  }
}

async function readBoundedUtf8Body(request: Request): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_POS_JSON_BYTES) {
        await reader.cancel();
        throw new PosRequestError(
          413,
          "REQUEST_TOO_LARGE",
          "The POS request is too large.",
        );
      }
      chunks.push(value);
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
      );
    } catch {
      throw new PosRequestError(400, "INVALID_JSON", "The POS request is not valid JSON.");
    }
  } finally {
    reader.releaseLock();
  }
}

export async function authenticatePosRequest(
  request: Request,
  rawBody: string,
  requestId: string,
): Promise<AuthenticatedPosRequest> {
  const terminalCode = terminalCodeSchema.safeParse(
    request.headers.get("x-yamzo-terminal"),
  );
  const timestamp = unixTimestampSchema.safeParse(
    request.headers.get("x-yamzo-timestamp"),
  );
  const nonce = terminalNonceSchema.safeParse(
    request.headers.get("x-yamzo-nonce"),
  );
  const declaredBodyHash = sha256HexSchema.safeParse(
    request.headers.get("x-yamzo-body-sha256"),
  );
  const signature = terminalSignatureSchema.safeParse(
    request.headers.get("x-yamzo-signature"),
  );

  if (
    !terminalCode.success ||
    !timestamp.success ||
    !nonce.success ||
    !declaredBodyHash.success ||
    !signature.success
  ) {
    throw new PosRequestError(
      401,
      "POS_AUTHENTICATION_REQUIRED",
      "Valid POS authentication is required.",
    );
  }

  const timestampSeconds = Number(timestamp.data);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    throw new PosRequestError(
      401,
      "POS_REQUEST_EXPIRED",
      "The POS request timestamp is outside the allowed window.",
    );
  }

  const actualBodyHash = sha256Hex(rawBody);
  if (!safeEqualHex(actualBodyHash, declaredBodyHash.data)) {
    throw new PosRequestError(
      401,
      "POS_SIGNATURE_INVALID",
      "The POS request signature is invalid.",
    );
  }

  const path = new URL(request.url).pathname;
  const admin = createAdminClient();
  const { data: verifierData, error: verifierError } = await admin
    .schema("api")
    .rpc("get_pos_terminal_verifier", {
      p_terminal_code: terminalCode.data,
    });
  if (verifierError) throw posAuthenticationDatabaseError(verifierError);

  const verifier = posTerminalVerifierSchema.safeParse(verifierData);
  if (!verifier.success) {
    throw new PosRequestError(
      503,
      "POS_SERVICE_UNAVAILABLE",
      "The POS service is temporarily unavailable.",
    );
  }

  const canonical = buildPosSignatureCanonical({
    method: request.method,
    path,
    terminalCode: terminalCode.data,
    timestamp: timestamp.data,
    nonce: nonce.data,
    bodySha256: declaredBodyHash.data,
  });
  if (
    !verifyPosSignature(
      canonical,
      verifier.data.public_key,
      signature.data,
    )
  ) {
    throw new PosRequestError(
      401,
      "POS_SIGNATURE_INVALID",
      "The POS request signature is invalid.",
    );
  }

  const { data: nonceConsumed, error: nonceError } = await admin
    .schema("api")
    .rpc("consume_pos_request_nonce", {
      p_terminal_id: verifier.data.terminal_id,
      p_timestamp: timestampSeconds,
      p_nonce: nonce.data,
      p_public_key_fingerprint: verifier.data.public_key_fingerprint,
    });
  if (nonceError) throw posAuthenticationDatabaseError(nonceError);
  if (nonceConsumed !== true) {
    throw new PosRequestError(
      503,
      "POS_SERVICE_UNAVAILABLE",
      "The POS service is temporarily unavailable.",
    );
  }

  return { admin, terminalId: verifier.data.terminal_id, requestId };
}

export function throwPosDatabaseError(error: Pick<PostgrestError, "code" | "message">): never {
  const conflicts = new Set([
    "IDEMPOTENCY_KEY_REUSED",
    "POS_EVENT_IN_PROGRESS",
    "INVALID_ORDER_STATUS_TRANSITION",
    "ORDER_CLAIMED_BY_ANOTHER_TERMINAL",
    "ORDER_VERSION_CONFLICT",
    "PRINT_JOB_ALREADY_CANCELLED",
    "PRINT_JOB_NOT_FOUND",
  ]);
  if (error.message === "ORDER_NOT_FOUND" || error.code === "PGRST116") {
    throw new PosRequestError(404, "ORDER_NOT_FOUND", "The website order was not found.");
  }
  if (conflicts.has(error.message)) {
    throw new PosRequestError(409, error.message, "The POS operation conflicts with the current remote state.");
  }
  if (error.message === "TERMINAL_NOT_ACTIVE") {
    throw new PosRequestError(403, "TERMINAL_NOT_ACTIVE", "This POS terminal is not active.");
  }
  throw new PosRequestError(
    503,
    "POS_SERVICE_UNAVAILABLE",
    "The POS service is temporarily unavailable.",
  );
}

export function posJson(
  body: unknown,
  init: { status: number; requestId: string },
) {
  return NextResponse.json(body, {
    status: init.status,
    headers: {
      "cache-control": "private, no-store, max-age=0",
      expires: "0",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "x-request-id": init.requestId,
    },
  });
}

export function posErrorResponse(error: unknown, requestId: string) {
  if (error instanceof ZodError) {
    return posJson(
      {
        error: "INVALID_POS_REQUEST",
        message: error.issues[0]?.message ?? "The POS request is invalid.",
        requestId,
      },
      { status: 400, requestId },
    );
  }
  if (error instanceof PosRequestError) {
    return posJson(
      { error: error.code, message: error.message, requestId },
      { status: error.status, requestId },
    );
  }
  return posJson(
    {
      error: "POS_SERVICE_UNAVAILABLE",
      message: "The POS service is temporarily unavailable.",
      requestId,
    },
    { status: 503, requestId },
  );
}

function posAuthenticationDatabaseError(
  error: Pick<PostgrestError, "message">,
): PosRequestError {
  if (error.message === "POS_REQUEST_REPLAYED") {
    return new PosRequestError(
      409,
      "POS_REQUEST_REPLAYED",
      "This POS request has already been used.",
    );
  }
  if (error.message === "TERMINAL_NOT_ACTIVE") {
    return new PosRequestError(
      403,
      "TERMINAL_NOT_ACTIVE",
      "This POS terminal is not active.",
    );
  }
  return new PosRequestError(
    401,
    "POS_SIGNATURE_INVALID",
    "The POS request signature is invalid.",
  );
}
