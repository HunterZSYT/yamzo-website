import type { CreateOrderRequest, CreateOrderResponse } from "@/lib/orders/types";

type ApiErrorBody = { error?: string; message?: string };

async function pendingOrderKey(payload: CreateOrderRequest): Promise<{
  idempotencyKey: string;
  storageKey: string;
}> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const storageKey = `yamzo:pending-order:${fingerprint}`;
  let idempotencyKey: string | null = null;

  try {
    idempotencyKey = sessionStorage.getItem(storageKey);
  } catch {
    // Some privacy modes disable sessionStorage. Database idempotency still
    // applies to this request, while storage-backed retries are unavailable.
  }

  if (!idempotencyKey) {
    idempotencyKey = `order:${crypto.randomUUID()}`;
    try {
      sessionStorage.setItem(storageKey, idempotencyKey);
    } catch {
      // See the privacy-mode note above.
    }
  }

  return { idempotencyKey, storageKey };
}

export async function createOrder(
  payload: CreateOrderRequest,
): Promise<CreateOrderResponse> {
  const pending = await pendingOrderKey(payload);
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": pending.idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(body.message ?? body.error ?? "We could not place your order.");
  }

  const result = (await response.json()) as CreateOrderResponse;

  try {
    sessionStorage.removeItem(pending.storageKey);
  } catch {
    // The response is already successful; storage cleanup is best-effort.
  }

  return result;
}
