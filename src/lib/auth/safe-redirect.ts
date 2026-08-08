const FALLBACK_PATH = "/";

export function getSafeRedirectPath(
  candidate: string | null | undefined,
  fallback = FALLBACK_PATH,
): string {
  if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(candidate, "https://yamzouttara.com");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
