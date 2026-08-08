import { describe, expect, it } from "vitest";

import {
  digitsOnly,
  normalizeBangladeshPhoneInput,
  normalizeCheckoutInput,
} from "./checkout-input";

describe("checkout numeric input normalization", () => {
  it("removes letters and punctuation from every digit-only address field", () => {
    expect(digitsOnly("11e")).toBe("11");
    expect(normalizeCheckoutInput("road", "20asdadwa")).toBe("20");
    expect(normalizeCheckoutInput("house", "80sssssdd")).toBe("80");
  });

  it("keeps a valid Bangladesh international phone prefix while stripping other characters", () => {
    expect(normalizeBangladeshPhoneInput("+880 1761-737584")).toBe(
      "+8801761737584",
    );
    expect(normalizeBangladeshPhoneInput("01e761foo737584")).toBe(
      "01761737584",
    );
    expect(normalizeBangladeshPhoneInput("017+61+737584")).toBe(
      "01761737584",
    );
  });

  it("leaves names and alphanumeric flat numbers unchanged", () => {
    expect(normalizeCheckoutInput("fullName", "Dots IT and Software Limited")).toBe(
      "Dots IT and Software Limited",
    );
    expect(normalizeCheckoutInput("flat", "3A")).toBe("3A");
  });
});
