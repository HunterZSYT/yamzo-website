export type AnalyticsConsent = "granted" | "denied";
export type AnalyticsConsentLocale = "en" | "bn";

declare global {
  interface Navigator {
    globalPrivacyControl?: boolean;
    msDoNotTrack?: string;
  }
}

export function hasBrowserPrivacySignal(
  browserNavigator: Pick<
    Navigator,
    "doNotTrack" | "globalPrivacyControl" | "msDoNotTrack"
  > = navigator,
): boolean {
  return (
    browserNavigator.globalPrivacyControl === true ||
    browserNavigator.doNotTrack === "1" ||
    browserNavigator.msDoNotTrack === "1"
  );
}

export function readAnalyticsConsent(
  cookie: string,
  cookieName: string,
): AnalyticsConsent | null {
  const prefix = `${cookieName}=`;
  const values = cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix))
    .map((part) => part.slice(prefix.length));

  if (values.includes("denied")) return "denied";
  return values.includes("granted") ? "granted" : null;
}

export function inferAnalyticsConsentLocale(
  pageDocument: Document = document,
): AnalyticsConsentLocale {
  const pageRoot = Array.from(pageDocument.body?.children ?? []).find(
    (element) =>
      element.hasAttribute("lang") &&
      !element.hasAttribute("data-analytics-consent"),
  );
  const language = pageRoot?.getAttribute("lang") ?? pageDocument.documentElement.lang;
  return language.toLowerCase().startsWith("bn") ? "bn" : "en";
}
