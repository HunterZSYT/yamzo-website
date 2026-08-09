import { describe, expect, it } from "vitest";

import { getAccountNavigationHref } from "./account-navigation-menu-item";

describe("account navigation destination", () => {
  it("sends an authenticated customer to their profile", () => {
    expect(getAccountNavigationHref(true, "/order-status")).toBe("/account");
  });

  it("keeps a guest's return path when sending them to sign in", () => {
    expect(getAccountNavigationHref(false, "/order-status?order=YZ-1")).toBe(
      "/login?next=%2Forder-status%3Forder%3DYZ-1",
    );
  });
});
