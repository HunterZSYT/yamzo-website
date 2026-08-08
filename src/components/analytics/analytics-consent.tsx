"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  META_ANALYTICS_CONSENT_COOKIE,
  META_ANALYTICS_CONSENT_EVENT,
} from "@/lib/meta/browser-events";

import {
  hasBrowserPrivacySignal,
  inferAnalyticsConsentLocale,
  readAnalyticsConsent,
  type AnalyticsConsent,
  type AnalyticsConsentLocale,
} from "./consent-utils";

const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const consentCopy = {
  en: {
    eyebrow: "Your privacy choice",
    title: "Optional browser analytics",
    body: "This helps us understand which pages and offers work well. If you accept, Meta Pixel may receive page views and order value—never your name, phone number, or address from this browser. Ordering works the same either way.",
    details: "Privacy details",
    accept: "Accept analytics",
    deny: "Keep off",
  },
  bn: {
    eyebrow: "আপনার গোপনীয়তার সিদ্ধান্ত",
    title: "ঐচ্ছিক ব্রাউজার অ্যানালিটিক্স",
    body: "কোন পৃষ্ঠা ও অফার ভালো কাজ করে তা বুঝতে এটি আমাদের সাহায্য করে। সম্মতি দিলে Meta Pixel পেজ ভিউ ও অর্ডারের মূল্য পেতে পারে—এই ব্রাউজার থেকে আপনার নাম, ফোন নম্বর বা ঠিকানা নয়। যেকোনো সিদ্ধান্তেই অর্ডার করা একইভাবে কাজ করবে।",
    details: "গোপনীয়তার বিস্তারিত",
    accept: "অ্যানালিটিক্সে সম্মতি দিন",
    deny: "বন্ধ রাখুন",
  },
} satisfies Record<AnalyticsConsentLocale, Record<string, string>>;

export function AnalyticsConsent({ enabled }: { enabled: boolean }) {
  const [locale, setLocale] = useState<AnalyticsConsentLocale>("en");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const syncLocale = () => setLocale(inferAnalyticsConsentLocale());
    const initialize = window.setTimeout(() => {
      syncLocale();
      setVisible(
        !hasBrowserPrivacySignal() &&
          readAnalyticsConsent(
            document.cookie,
            META_ANALYTICS_CONSENT_COOKIE,
          ) === null,
      );
    }, 0);

    const observer = new MutationObserver(syncLocale);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
      childList: true,
      subtree: true,
    });

    return () => {
      window.clearTimeout(initialize);
      observer.disconnect();
    };
  }, [enabled]);

  const saveChoice = (choice: AnalyticsConsent) => {
    const resolvedChoice = hasBrowserPrivacySignal() ? "denied" : choice;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${META_ANALYTICS_CONSENT_COOKIE}=${resolvedChoice}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    window.dispatchEvent(
      new CustomEvent(META_ANALYTICS_CONSENT_EVENT, {
        detail: { granted: resolvedChoice === "granted" },
      }),
    );
    setVisible(false);
  };

  if (!enabled || !visible) return null;

  const text = consentCopy[locale];

  return (
    <aside
      data-analytics-consent=""
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex justify-center sm:inset-x-5 sm:bottom-5"
      aria-labelledby="analytics-consent-title"
      aria-describedby="analytics-consent-description"
    >
      <div
        lang={locale}
        className={`pointer-events-auto w-full max-w-3xl rounded-2xl border border-sky-100 bg-white/98 p-4 text-foreground shadow-[0_20px_60px_rgba(8,42,68,.22)] backdrop-blur-xl sm:flex sm:items-center sm:gap-6 sm:p-5 ${locale === "bn" ? "font-bengali" : ""}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[.68rem] font-extrabold uppercase tracking-[.14em] text-primary">
            {text.eyebrow}
          </p>
          <h2
            id="analytics-consent-title"
            className="mt-1.5 text-base font-black tracking-[-.025em]"
          >
            {text.title}
          </h2>
          <p
            id="analytics-consent-description"
            className="mt-1.5 text-xs leading-5 text-muted-foreground"
          >
            {text.body}{" "}
            <Link
              href="/privacy#analytics"
              className="inline-flex min-h-6 items-center font-bold text-primary underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {text.details}
            </Link>
          </p>
        </div>
        <div className="mt-4 grid shrink-0 grid-cols-2 gap-2 sm:mt-0 sm:w-72">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 whitespace-normal px-3"
            onClick={() => saveChoice("denied")}
          >
            {text.deny}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 whitespace-normal border-primary px-3 text-primary hover:bg-sky-50 hover:text-primary"
            onClick={() => saveChoice("granted")}
          >
            {text.accept}
          </Button>
        </div>
      </div>
    </aside>
  );
}
