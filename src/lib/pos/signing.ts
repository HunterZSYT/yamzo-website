import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify,
} from "node:crypto";

export const POS_SIGNATURE_VERSION = "v1";

export interface PosSignatureFields {
  method: string;
  path: string;
  terminalCode: string;
  timestamp: string;
  nonce: string;
  bodySha256: string;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildPosSignatureCanonical(fields: PosSignatureFields): string {
  return [
    POS_SIGNATURE_VERSION,
    fields.method.toUpperCase(),
    fields.path,
    fields.terminalCode,
    fields.timestamp,
    fields.nonce,
    fields.bodySha256.toLowerCase(),
  ].join("\n");
}

export function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

/**
 * Verifies an Ed25519 signature using a public-only SPKI key. Malformed or
 * non-Ed25519 keys fail closed without exposing parser details to a terminal.
 */
export function verifyPosSignature(
  canonical: string,
  publicKeyBase64Url: string,
  signatureBase64Url: string,
): boolean {
  if (
    !/^[A-Za-z0-9_-]{59}$/.test(publicKeyBase64Url) ||
    !/^[A-Za-z0-9_-]{86}$/.test(signatureBase64Url)
  ) {
    return false;
  }

  try {
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyBase64Url, "base64url"),
      format: "der",
      type: "spki",
    });
    if (publicKey.asymmetricKeyType !== "ed25519") return false;
    return verify(
      null,
      Buffer.from(canonical, "utf8"),
      publicKey,
      Buffer.from(signatureBase64Url, "base64url"),
    );
  } catch {
    return false;
  }
}
