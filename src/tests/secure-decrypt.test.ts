import { describe, it, expect } from "vitest";
import {
  generateAESKey,
  encryptPayload,
  decryptPayload,
  wrapAESKey,
  unwrapAESKey,
  getPublicKeyForAddress,
} from "../lib/crypto";

describe("Secure Decrypt & Key Envelope (#49)", () => {
  it("round-trips a sale payload through AES-GCM encrypt/decrypt", async () => {
    const key = await generateAESKey();
    const payload = { saleId: 42, saleAmount: "100.0", commissionAmount: "10.0" };
    const envelope = await encryptPayload(payload, key);
    expect(envelope).not.toBe("STUB_ENCRYPTED_PAYLOAD");
    const decrypted = await decryptPayload(envelope, key);
    expect(decrypted).toEqual(payload);
  });

  it("rejects tampered envelopes with a generic error", async () => {
    const key = await generateAESKey();
    const envelope = await encryptPayload({ saleId: 1 }, key);
    const tampered = envelope.slice(0, -4) + "AAAA";
    await expect(decryptPayload(tampered, key)).rejects.toThrow(
      "Decryption failed: invalid payload or key.",
    );
  });

  it("rejects decryption with the wrong key", async () => {
    const keyA = await generateAESKey();
    const keyB = await generateAESKey();
    const envelope = await encryptPayload({ saleId: 7 }, keyA);
    await expect(decryptPayload(envelope, keyB)).rejects.toThrow(
      "Decryption failed: invalid payload or key.",
    );
  });

  it("rejects legacy stub payloads", async () => {
    const key = await generateAESKey();
    await expect(decryptPayload("STUB_ENCRYPTED_PAYLOAD", key)).rejects.toThrow(
      "Decryption failed: invalid payload or key.",
    );
  });

  it("round-trips key wrap/unwrap with the same identifier", async () => {
    const key = await generateAESKey();
    const identifier = await getPublicKeyForAddress(
      "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );
    const wrapped = await wrapAESKey(key, identifier);
    const unwrapped = await unwrapAESKey(wrapped, identifier);
    const probe = await encryptPayload({ saleId: 9 }, unwrapped);
    expect(await decryptPayload(probe, key)).toEqual({ saleId: 9 });
  });

  it("rejects unwrap with a mismatched identifier", async () => {
    const key = await generateAESKey();
    const wrapped = await wrapAESKey(key, "alice");
    await expect(unwrapAESKey(wrapped, "bob")).rejects.toThrow(
      "Key unwrap failed: invalid wrapped key or identifier.",
    );
  });
});
