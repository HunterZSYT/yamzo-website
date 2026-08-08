import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PosRequestError, readPosJsonBody } from "@/lib/pos/http";

describe("POS HTTP request bounds", () => {
  it("reads valid JSON using an exact JSON media type", async () => {
    const body = '{"limit":20}';
    await expect(readPosJsonBody(new Request("https://yamzouttara.com/api/pos", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body,
    }))).resolves.toEqual({ rawBody: body, value: { limit: 20 } });
  });

  it("rejects JSON-like media types and encoded request bodies", async () => {
    await expect(readPosJsonBody(new Request("https://yamzouttara.com/api/pos", {
      method: "POST",
      headers: { "content-type": "application/jsonp" },
      body: "{}",
    }))).rejects.toMatchObject({ status: 415, code: "JSON_REQUIRED" });
    await expect(readPosJsonBody(new Request("https://yamzouttara.com/api/pos", {
      method: "POST",
      headers: { "content-type": "application/json", "content-encoding": "gzip" },
      body: "{}",
    }))).rejects.toMatchObject({ status: 415, code: "JSON_REQUIRED" });
  });

  it("stops reading streamed bodies above the 64 KiB limit", async () => {
    try {
      await readPosJsonBody(new Request("https://yamzouttara.com/api/pos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: `"${"x".repeat(65 * 1024)}"`,
      }));
      throw new Error("Expected request size validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PosRequestError);
      expect(error).toMatchObject({ status: 413, code: "REQUEST_TOO_LARGE" });
    }
  });
});
