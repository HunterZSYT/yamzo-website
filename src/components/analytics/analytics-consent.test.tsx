import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  META_ANALYTICS_CONSENT_COOKIE,
  META_ANALYTICS_CONSENT_EVENT,
} from "@/lib/meta/browser-events";

import { AnalyticsConsent } from "./analytics-consent";
import {
  hasBrowserPrivacySignal,
  inferAnalyticsConsentLocale,
  readAnalyticsConsent,
} from "./consent-utils";

function clearConsentCookie() {
  document.cookie = `${META_ANALYTICS_CONSENT_COOKIE}=; Path=/; Max-Age=0`;
}

function setNavigatorValue(name: "globalPrivacyControl" | "doNotTrack", value: unknown) {
  Object.defineProperty(window.navigator, name, {
    configurable: true,
    value,
  });
}

describe("analytics consent", () => {
  beforeEach(() => {
    clearConsentCookie();
    setNavigatorValue("globalPrivacyControl", false);
    setNavigatorValue("doNotTrack", "0");
    document.documentElement.lang = "en";
  });

  afterEach(() => {
    clearConsentCookie();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("is denied by default and offers equally available explicit choices", async () => {
    render(<AnalyticsConsent enabled />);

    expect(
      await screen.findByRole("heading", { name: "Optional browser analytics" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep off" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Accept analytics" })).toBeEnabled();
    expect(
      readAnalyticsConsent(document.cookie, META_ANALYTICS_CONSENT_COOKIE),
    ).toBeNull();
  });

  it("persists consent and notifies the existing Meta runtime", async () => {
    const listener = vi.fn();
    window.addEventListener(META_ANALYTICS_CONSENT_EVENT, listener);
    render(<AnalyticsConsent enabled />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Accept analytics" }),
    );

    expect(
      readAnalyticsConsent(document.cookie, META_ANALYTICS_CONSENT_COOKIE),
    ).toBe("granted");
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      granted: true,
    });
    expect(screen.queryByText("Optional browser analytics")).not.toBeInTheDocument();
    window.removeEventListener(META_ANALYTICS_CONSENT_EVENT, listener);
  });

  it("persists a keep-off choice without activating analytics", async () => {
    const listener = vi.fn();
    window.addEventListener(META_ANALYTICS_CONSENT_EVENT, listener);
    render(<AnalyticsConsent enabled />);

    fireEvent.click(await screen.findByRole("button", { name: "Keep off" }));

    expect(
      readAnalyticsConsent(document.cookie, META_ANALYTICS_CONSENT_COOKIE),
    ).toBe("denied");
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      granted: false,
    });
    window.removeEventListener(META_ANALYTICS_CONSENT_EVENT, listener);
  });

  it("keeps analytics denied if conflicting cookies are present", () => {
    expect(
      readAnalyticsConsent(
        `${META_ANALYTICS_CONSENT_COOKIE}=granted; ${META_ANALYTICS_CONSENT_COOKIE}=denied`,
        META_ANALYTICS_CONSENT_COOKIE,
      ),
    ).toBe("denied");
  });

  it("does not prompt or grant when Global Privacy Control is active", async () => {
    setNavigatorValue("globalPrivacyControl", true);
    render(<AnalyticsConsent enabled />);

    await waitFor(() => {
      expect(screen.queryByText("Optional browser analytics")).not.toBeInTheDocument();
    });
    expect(hasBrowserPrivacySignal()).toBe(true);
  });

  it("tracks an inferable Bangla storefront locale", async () => {
    const pageRoot = document.createElement("main");
    pageRoot.lang = "bn";
    document.body.appendChild(pageRoot);

    expect(inferAnalyticsConsentLocale()).toBe("bn");
    render(<AnalyticsConsent enabled />);

    expect(
      await screen.findByRole("heading", { name: "ঐচ্ছিক ব্রাউজার অ্যানালিটিক্স" }),
    ).toBeInTheDocument();
  });
});
