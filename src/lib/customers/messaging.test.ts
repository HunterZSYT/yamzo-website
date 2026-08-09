import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getCustomerMessagingConfiguration,
  renderCustomerCampaignHtml,
  renderCustomerCampaignText,
} from "./messaging";

describe("customer messaging configuration", () => {
  it("fails closed until all required server settings exist", () => {
    expect(getCustomerMessagingConfiguration({ RESEND_API_KEY: "re_test" })).toBeNull();
  });

  it("accepts complete server-only delivery settings", () => {
    expect(
      getCustomerMessagingConfiguration({
        RESEND_API_KEY: "re_test",
        RESEND_CUSTOMERS_SEGMENT_ID: "segment_123",
        RESEND_CUSTOMERS_FROM: "Yamzo <sales@example.com>",
      }),
    ).toEqual({
      apiKey: "re_test",
      segmentId: "segment_123",
      from: "Yamzo <sales@example.com>",
      replyTo: null,
    });
  });
});

describe("customer campaign rendering", () => {
  it("escapes draft text and includes the Resend unsubscribe placeholder", () => {
    const html = renderCustomerCampaignHtml("Hello <customer>\n\nStay & save");

    expect(html).toContain("Hello &lt;customer&gt;");
    expect(html).toContain("Stay &amp; save");
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
  });

  it("keeps the same unsubscribe mechanism in the plain text version", () => {
    expect(renderCustomerCampaignText("A new Yamzo offer")).toContain(
      "{{{RESEND_UNSUBSCRIBE_URL}}}",
    );
  });
});
