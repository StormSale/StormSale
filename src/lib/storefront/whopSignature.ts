import { constantTimeCompare } from "../webhookSecurity";

export async function computeWhopSignature(opts: {
  secret: string;
  id: string;
  timestamp: string;
  rawBody: string;
}): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(opts.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${opts.id}.${opts.timestamp}.${opts.rawBody}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signed)));
}

export interface WhopSignatureInput {
  secret: string;
  rawBody: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  toleranceSeconds?: number;
  nowSeconds?: number;
}

export async function verifyWhopSignature(input: WhopSignatureInput): Promise<boolean> {
  const { id, timestamp, signature, secret, rawBody } = input;
  if (!id || !timestamp || !signature || !secret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > (input.toleranceSeconds ?? 300)) return false;

  const expected = await computeWhopSignature({ secret, id, timestamp, rawBody });
  // The header can hold several space-separated "v1,<signature>" entries.
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    return version === "v1" && !!value && constantTimeCompare(value, expected);
  });
}
