import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildPosSignatureCanonical,
  safeEqualHex,
  sha256Hex,
  verifyPosSignature,
} from "@/lib/pos/signing";

describe("POS request signing contract", () => {
  it("builds an unambiguous versioned canonical request", () => {
    expect(
      buildPosSignatureCanonical({
        method: "post",
        path: "/api/pos/orders/claim",
        terminalCode: "YAMZO_UTTARA_01",
        timestamp: "1786176000",
        nonce: "abcdefghijklmnopqrstuv",
        bodySha256: "A".repeat(64),
      }),
    ).toBe(
      [
        "v1",
        "POST",
        "/api/pos/orders/claim",
        "YAMZO_UTTARA_01",
        "1786176000",
        "abcdefghijklmnopqrstuv",
        "a".repeat(64),
      ].join("\n"),
    );
  });

  it("compares only valid SHA-256 values", () => {
    const digest = sha256Hex('{"limit":20}');
    expect(safeEqualHex(digest, digest)).toBe(true);
    expect(safeEqualHex(digest, "0".repeat(64))).toBe(false);
    expect(safeEqualHex(digest, "not-a-digest")).toBe(false);
  });

  it("verifies only Ed25519 signatures for the exact canonical request", () => {
    const keyPair = generateKeyPairSync("ed25519");
    const publicKey = keyPair.publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64url");
    const canonical = "v1\nPOST\n/api/pos/orders/claim\nTERMINAL_01\n1786176000\nnonce\nbody";
    const signature = sign(
      null,
      Buffer.from(canonical, "utf8"),
      keyPair.privateKey,
    ).toString("base64url");

    expect(verifyPosSignature(canonical, publicKey, signature)).toBe(true);
    expect(verifyPosSignature(`${canonical}!`, publicKey, signature)).toBe(false);
    expect(verifyPosSignature(canonical, publicKey, "bad")).toBe(false);
  });
});
