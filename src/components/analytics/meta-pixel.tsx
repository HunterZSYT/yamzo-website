"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import {
  browserMetaPurchaseWasSent,
  markBrowserMetaPurchaseSent,
  META_ANALYTICS_CONSENT_COOKIE,
  META_ANALYTICS_CONSENT_EVENT,
  META_PURCHASE_EVENT,
  readPendingBrowserMetaPurchases,
} from "@/lib/meta/browser-events";
import {
  browserMetaPurchaseSchema,
  type BrowserMetaPurchase,
} from "@/lib/meta/contracts";

import {
  hasBrowserPrivacySignal,
  readAnalyticsConsent,
} from "./consent-utils";

type MetaFbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  loaded?: boolean;
  queue?: unknown[][];
  version?: string;
};

declare global {
  interface Window {
    _fbq?: MetaFbq;
    fbq?: MetaFbq;
    __yamzoMetaPixelIds?: Set<string>;
  }

}

const META_SCRIPT_ID = "yamzo-meta-pixel-runtime";

export function MetaPixel({ pixelId }: { pixelId: string | null }) {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const lastPageView = useRef<string | null>(null);

  const trackPurchase = useCallback(
    (input: unknown) => {
      if (!active || !pixelId || !window.fbq) return;
      const event = browserMetaPurchaseSchema.safeParse(input);
      if (!event.success || browserMetaPurchaseWasSent(event.data.eventId)) {
        return;
      }

      window.fbq(
        "trackSingle",
        pixelId,
        "Purchase",
        { value: event.data.value, currency: event.data.currency },
        { eventID: event.data.eventId },
      );
      markBrowserMetaPurchaseSent(event.data.eventId);
    },
    [active, pixelId],
  );

  useEffect(() => {
    if (!pixelId || !/^\d{5,32}$/.test(pixelId)) return;

    const activate = () => {
      if (!hasExplicitAnalyticsConsent()) return;
      installMetaPixel(pixelId);
      setActive(true);
    };
    const onConsent = (event: Event) => {
      const detail = (event as CustomEvent<{ granted?: boolean }>).detail;
      if (detail?.granted && hasExplicitAnalyticsConsent()) {
        activate();
        return;
      }
      window.fbq?.("consent", "revoke");
      setActive(false);
    };

    activate();
    window.addEventListener(META_ANALYTICS_CONSENT_EVENT, onConsent);
    return () => {
      window.removeEventListener(META_ANALYTICS_CONSENT_EVENT, onConsent);
    };
  }, [pixelId]);

  useEffect(() => {
    if (!active || !pixelId || !window.fbq) return;
    if (lastPageView.current !== pathname) {
      window.fbq("trackSingle", pixelId, "PageView");
      lastPageView.current = pathname;
    }
    readPendingBrowserMetaPurchases().forEach(trackPurchase);
  }, [active, pathname, pixelId, trackPurchase]);

  useEffect(() => {
    const onPurchase = (event: Event) => {
      trackPurchase((event as CustomEvent<BrowserMetaPurchase>).detail);
    };
    window.addEventListener(META_PURCHASE_EVENT, onPurchase);
    return () => window.removeEventListener(META_PURCHASE_EVENT, onPurchase);
  }, [trackPurchase]);

  return null;
}

export function hasExplicitAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  if (hasBrowserPrivacySignal()) return false;

  return (
    readAnalyticsConsent(document.cookie, META_ANALYTICS_CONSENT_COOKIE) ===
    "granted"
  );
}

function installMetaPixel(pixelId: string): void {
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue?.push(args);
    } as MetaFbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
  }

  window.__yamzoMetaPixelIds ??= new Set<string>();
  if (!window.__yamzoMetaPixelIds.has(pixelId)) {
    window.fbq("init", pixelId);
    window.__yamzoMetaPixelIds.add(pixelId);
  }
  window.fbq("consent", "grant");

  if (!document.getElementById(META_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = META_SCRIPT_ID;
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.referrerPolicy = "strict-origin-when-cross-origin";
    document.head.appendChild(script);
  }
}
