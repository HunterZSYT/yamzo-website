"use client";

import {
  browserMetaPurchaseSchema,
  type BrowserMetaPurchase,
} from "@/lib/meta/contracts";

export const META_ANALYTICS_CONSENT_COOKIE = "yamzo_analytics_consent";
export const META_ANALYTICS_CONSENT_EVENT = "yamzo:analytics-consent";
export const META_PURCHASE_EVENT = "yamzo:meta-purchase";
export const META_PENDING_PURCHASE_PREFIX = "yamzo:meta:pending:";
export const META_SENT_PURCHASE_PREFIX = "yamzo:meta:sent:";

export function metaPurchaseEventId(orderReference: string): string | null {
  const eventId = `purchase-${orderReference}`;
  return /^purchase-YZ-\d{8}-\d{8}$/.test(eventId) ? eventId : null;
}

/**
 * Stores only a non-PII conversion summary in session storage. The Pixel
 * runtime sends it only after explicit analytics consent and removes it after
 * the browser event is queued.
 */
export function queueBrowserMetaPurchase(input: BrowserMetaPurchase): void {
  const event = browserMetaPurchaseSchema.safeParse(input);
  if (!event.success || typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      `${META_PENDING_PURCHASE_PREFIX}${event.data.eventId}`,
      JSON.stringify(event.data),
    );
  } catch {
    // Privacy modes can disable storage. The server CAPI event remains the
    // authoritative conversion and order status must never depend on Pixel.
  }

  window.dispatchEvent(
    new CustomEvent(META_PURCHASE_EVENT, { detail: event.data }),
  );
}

export function readPendingBrowserMetaPurchases(): BrowserMetaPurchase[] {
  if (typeof window === "undefined") return [];
  const events: BrowserMetaPurchase[] = [];

  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(META_PENDING_PURCHASE_PREFIX)) continue;
      const value = window.sessionStorage.getItem(key);
      if (!value) continue;
      const parsed = browserMetaPurchaseSchema.safeParse(JSON.parse(value));
      if (parsed.success) events.push(parsed.data);
    }
  } catch {
    return [];
  }

  return events;
}

export function browserMetaPurchaseWasSent(eventId: string): boolean {
  try {
    return window.sessionStorage.getItem(
      `${META_SENT_PURCHASE_PREFIX}${eventId}`,
    ) === "1";
  } catch {
    return false;
  }
}

export function markBrowserMetaPurchaseSent(eventId: string): void {
  try {
    window.sessionStorage.removeItem(
      `${META_PENDING_PURCHASE_PREFIX}${eventId}`,
    );
    window.sessionStorage.setItem(
      `${META_SENT_PURCHASE_PREFIX}${eventId}`,
      "1",
    );
  } catch {
    // Meta deduplicates the matching browser/server event ID even when local
    // storage is unavailable, so this optimization may safely fail open.
  }
}
