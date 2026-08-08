import { describe, expect, it } from "vitest";

import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";

describe("getSafeRedirectPath", () => {
  it("keeps local routes with search and hash values", () => {
    expect(getSafeRedirectPath("/orders?filter=open#latest")).toBe(
      "/orders?filter=open#latest",
    );
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "javascript:alert(1)",
    "orders",
    "",
  ])("rejects an unsafe redirect candidate: %s", (candidate) => {
    expect(getSafeRedirectPath(candidate)).toBe("/");
  });

  it("supports an explicit safe fallback", () => {
    expect(getSafeRedirectPath(null, "/login")).toBe("/login");
  });
});
