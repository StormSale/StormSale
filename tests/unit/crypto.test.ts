import { describe, it, expect } from "vitest";
import {
  generateAESKey,
  encryptPayload,
  decryptPayload,
  wrapAESKey,
  unwrapAESKey,
  getPublicKeyForAddress,
} from "../../src/lib/crypto";

describe("[Test] AES Crypto Accuracy Suite (#88)", () => {
  // Helper to decode envelope structure for inspection
  function parseEnvelope(envelopeB64: string) {
    const jsonStr = atob(envelopeB64);
    return JSON.parse(jsonStr) as {
      v: number;
      alg: string;
      iv: string;
      data: string;
    };
  }

  // Helper to encode modified envelope
  function buildEnvelope(env: { v: number; alg: string; iv: string; data: string }): string {
    return btoa(JSON.stringify(env));
  }

  describe("1. Key Generation & WebCrypto Parameters", () => {
    it("generates a valid 256-bit extractable AES-GCM CryptoKey", async () => {
      const key = await generateAESKey();
      expect(key).toBeDefined();
      expect(key.type).toBe("secret");
      expect(key.extractable).toBe(true);
      expect((key.algorithm as AesKeyAlgorithm).name).toBe("AES-GCM");
      expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
      expect(key.usages).toContain("encrypt");
      expect(key.usages).toContain("decrypt");
    });

    it("rejects non-AES-GCM keys or malformed keys in encryptPayload and decryptPayload", async () => {
      const fakeKey = { algorithm: { name: "HMAC" } } as unknown as CryptoKey;
      await expect(encryptPayload({ test: 1 }, fakeKey)).rejects.toThrow(
        "Decryption failed: invalid key.",
      );
      await expect(decryptPayload("dummy", fakeKey)).rejects.toThrow(
        "Decryption failed: invalid key.",
      );

      const nullKey = null as unknown as CryptoKey;
      await expect(encryptPayload({ test: 1 }, nullKey)).rejects.toThrow(
        "Decryption failed: invalid key.",
      );
      await expect(decryptPayload("dummy", nullKey)).rejects.toThrow(
        "Decryption failed: invalid key.",
      );
    });
  });

  describe("2. Verified Round-Trip Accuracy & Canonical Types", () => {
    it("round-trips standard conversion and affiliate payload objects accurately", async () => {
      const key = await generateAESKey();
      const payload = {
        saleId: 1042,
        affiliate: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        campaignId: "CAMPAIGN-XLM-2026",
        saleAmount: "1250.75",
        commissionAmount: "125.075",
        timestamp: 1774320000,
        metadata: {
          referrer: "https://t.me/stormsale_bot",
          tags: ["crypto", "soroban", "escrow"],
        },
      };

      const envelope = await encryptPayload(payload, key);
      expect(typeof envelope).toBe("string");
      expect(envelope.length).toBeGreaterThan(0);

      const decrypted = await decryptPayload(envelope, key);
      expect(decrypted).toEqual(payload);
    });

    it("round-trips an empty object cleanly", async () => {
      const key = await generateAESKey();
      const envelope = await encryptPayload({}, key);
      const decrypted = await decryptPayload(envelope, key);
      expect(decrypted).toEqual({});
    });

    it("round-trips diverse primitive types, numeric representations, and nested arrays", async () => {
      const key = await generateAESKey();
      const payload = {
        boolTrue: true,
        boolFalse: false,
        nullVal: null,
        intZero: 0,
        intNegative: -42,
        intLarge: 9007199254740991,
        floatSmall: 0.0000001,
        floatNegative: -123.456789,
        scientific: 1.5e10,
        emptyString: "",
        normalString: "StormSale Affiliate Protocol",
        nestedArray: [1, "two", false, null, { subKey: "subValue" }],
        deepObject: {
          level1: {
            level2: {
              level3: {
                flag: true,
                values: [10, 20, 30],
              },
            },
          },
        },
      };

      const envelope = await encryptPayload(payload, key);
      const decrypted = await decryptPayload(envelope, key);
      expect(decrypted).toEqual(payload);
    });

    it("preserves UTF-8 Unicode, multilingual text, emojis, and special symbols losslessly", async () => {
      const key = await generateAESKey();
      const unicodePayload = {
        arabic: "بروتوكول ستورم سيل اللامركزي ⚡",
        chinese: "去中心化联盟营销协议：安全与隐私保护",
        japanese: "暗号化アフィリエイト・プロトコル 🚀",
        cyrillic: "Децентрализованный протокол партнёрских выплат",
        greek: "Αποκεντρωμένο πρωτόκολλο πληρωμών",
        emojis: "💎 ⚡ 🛡️ 🚀 🔒 🌐 💰 📈 🤖",
        zeroWidth: "Hidden\u200B\u200C\u200DSpace",
        mathSymbols: "∀x ∈ ℝ: x² ≥ 0 ∧ ∑(i=1..n) i = n(n+1)/2",
        accents: "éàèùçñöäüßÅøæ",
        quotesAndEscapes: "Line 1\nLine 2\t\"Double Quotes\" & 'Single Quotes' \\ Backslashes //",
      };

      const envelope = await encryptPayload(unicodePayload, key);
      const decrypted = await decryptPayload(envelope, key);
      expect(decrypted).toEqual(unicodePayload);
    });

    it("guarantees multi-iteration consistency across repeated decryptions", async () => {
      const key = await generateAESKey();
      const payload = { token: "XLM", amount: "5000", orderId: "ORD-9999" };
      const envelope = await encryptPayload(payload, key);

      for (let i = 0; i < 25; i++) {
        const decrypted = await decryptPayload(envelope, key);
        expect(decrypted).toEqual(payload);
      }
    });
  });

  describe("3. Non-deterministic Ciphertext & IV Entropy (IND-CPA)", () => {
    it("generates distinct IVs and unique ciphertexts for identical plaintext payloads", async () => {
      const key = await generateAESKey();
      const payload = { target: "same-payload-data", counter: 1 };

      const envelopes = await Promise.all([
        encryptPayload(payload, key),
        encryptPayload(payload, key),
        encryptPayload(payload, key),
        encryptPayload(payload, key),
        encryptPayload(payload, key),
      ]);

      // All envelopes must be unique
      const uniqueEnvelopes = new Set(envelopes);
      expect(uniqueEnvelopes.size).toBe(5);

      // Verify each envelope has an independent 12-byte IV
      const ivs = envelopes.map((env) => parseEnvelope(env).iv);
      const uniqueIvs = new Set(ivs);
      expect(uniqueIvs.size).toBe(5);

      // All IVs must decode to exactly 12 bytes (96 bits)
      for (const ivB64 of ivs) {
        const binary = atob(ivB64);
        expect(binary.length).toBe(12);
      }

      // Each envelope decodes back to the original payload
      for (const env of envelopes) {
        expect(await decryptPayload(env, key)).toEqual(payload);
      }
    });
  });

  describe("4. Cryptographic Authentication & Tamper-Resistance", () => {
    it("rejects ciphertexts with modified or flipped bits (GCM Auth Tag Failure)", async () => {
      const key = await generateAESKey();
      const payload = { secret: "confidential-payout", amount: 1000 };
      const envelope = await encryptPayload(payload, key);
      const envObj = parseEnvelope(envelope);

      // Mutate raw ciphertext bytes
      const rawData = atob(envObj.data);
      const bytes = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);

      // Flip a bit in the middle of ciphertext
      bytes[Math.floor(bytes.length / 2)] ^= 0x01;

      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      envObj.data = btoa(binary);

      const tamperedEnvelope = buildEnvelope(envObj);
      await expect(decryptPayload(tamperedEnvelope, key)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );
    });

    it("rejects modified IV vectors", async () => {
      const key = await generateAESKey();
      const envelope = await encryptPayload({ sensitive: true }, key);
      const envObj = parseEnvelope(envelope);

      // Tamper IV bytes
      const rawIv = atob(envObj.iv);
      const bytes = new Uint8Array(rawIv.length);
      for (let i = 0; i < rawIv.length; i++) bytes[i] = rawIv.charCodeAt(i);
      bytes[0] ^= 0xff; // flip first byte

      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      envObj.iv = btoa(binary);

      const tampered = buildEnvelope(envObj);
      await expect(decryptPayload(tampered, key)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );
    });

    it("rejects invalid IV length (non-12-byte IV)", async () => {
      const key = await generateAESKey();
      const envelope = await encryptPayload({ test: 123 }, key);
      const envObj = parseEnvelope(envelope);

      // Provide 16-byte IV instead of 12-byte
      envObj.iv = btoa("0123456789abcdef");
      await expect(decryptPayload(buildEnvelope(envObj), key)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );

      // Provide truncated 8-byte IV
      envObj.iv = btoa("12345678");
      await expect(decryptPayload(buildEnvelope(envObj), key)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );
    });

    it("rejects invalid envelope version numbers and algorithms", async () => {
      const key = await generateAESKey();
      const envelope = await encryptPayload({ item: 1 }, key);
      const envObj = parseEnvelope(envelope);

      // Unsupported version
      const v2Env = buildEnvelope({ ...envObj, v: 2 });
      await expect(decryptPayload(v2Env, key)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );

      // Unsupported algorithm
      const cbcEnv = buildEnvelope({ ...envObj, alg: "AES-CBC" });
      await expect(decryptPayload(cbcEnv, key)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );
    });

    it("rejects decryption when using a different AES key", async () => {
      const keyA = await generateAESKey();
      const keyB = await generateAESKey();
      const envelope = await encryptPayload({ confidential: "data" }, keyA);

      await expect(decryptPayload(envelope, keyB)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );
    });

    it("rejects malformed envelopes, legacy stub strings, and corrupt JSON", async () => {
      const key = await generateAESKey();

      await expect(decryptPayload("STUB_ENCRYPTED_PAYLOAD", key)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );
      await expect(decryptPayload("", key)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );
      await expect(decryptPayload("not-base64!@#$%", key)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );
      await expect(decryptPayload(btoa("just raw plain string"), key)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );
      await expect(
        decryptPayload(btoa(JSON.stringify({ notAnEnvelope: true })), key),
      ).rejects.toThrow("Decryption failed: invalid payload or key.");
    });
  });

  describe("5. Key Wrapping & Unwrapping Round-Trip", () => {
    it("wraps and unwraps AES keys using Stellar G-addresses and verifies cross-key decryption", async () => {
      const originalKey = await generateAESKey();
      const stellarAddr = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      const recipientId = await getPublicKeyForAddress(stellarAddr);

      expect(recipientId).toBe(stellarAddr);

      const wrappedKeyEnvelope = await wrapAESKey(originalKey, recipientId);
      expect(typeof wrappedKeyEnvelope).toBe("string");

      const unwrappedKey = await unwrapAESKey(wrappedKeyEnvelope, recipientId);
      expect(unwrappedKey).toBeDefined();

      // Verify cross-key parity: encrypt with original, decrypt with unwrapped
      const payload1 = { message: "encrypted with original key", amount: "500.00" };
      const enc1 = await encryptPayload(payload1, originalKey);
      const dec1 = await decryptPayload(enc1, unwrappedKey);
      expect(dec1).toEqual(payload1);

      // Verify reverse cross-key parity: encrypt with unwrapped, decrypt with original
      const payload2 = { message: "encrypted with unwrapped key", amount: "750.00" };
      const enc2 = await encryptPayload(payload2, unwrappedKey);
      const dec2 = await decryptPayload(enc2, originalKey);
      expect(dec2).toEqual(payload2);
    });

    it("wraps and unwraps AES keys using Stellar C-contract addresses", async () => {
      const key = await generateAESKey();
      const contractAddr = "CA76543210FEDCBA9876543210FEDCBA9876543210FEDCBA98765432";
      const recipientId = await getPublicKeyForAddress(contractAddr);

      expect(recipientId).toBe(contractAddr);

      const wrapped = await wrapAESKey(key, recipientId);
      const unwrapped = await unwrapAESKey(wrapped, recipientId);

      const testPayload = { contractEscrow: true, id: 99 };
      const enc = await encryptPayload(testPayload, unwrapped);
      expect(await decryptPayload(enc, key)).toEqual(testPayload);
    });

    it("supports custom address formats and prefixes with STORMSALE-PUBKEY:", async () => {
      const key = await generateAESKey();
      const customId = "auditor_primary_key_identifier";
      const recipientId = await getPublicKeyForAddress(customId);

      expect(recipientId).toBe("STORMSALE-PUBKEY:auditor_primary_key_identifier");

      const wrapped = await wrapAESKey(key, recipientId);
      const unwrapped = await unwrapAESKey(wrapped, recipientId);

      const testPayload = { auditorCheck: "PASSED" };
      const enc = await encryptPayload(testPayload, key);
      expect(await decryptPayload(enc, unwrapped)).toEqual(testPayload);
    });

    it("rejects unwrap attempts with mismatched recipient identifiers", async () => {
      const key = await generateAESKey();
      const wrapped = await wrapAESKey(key, "authorized_recipient");

      await expect(unwrapAESKey(wrapped, "unauthorized_adversary")).rejects.toThrow(
        "Key unwrap failed: invalid wrapped key or identifier.",
      );
    });

    it("rejects wrapping with empty or invalid identifiers", async () => {
      const key = await generateAESKey();
      await expect(wrapAESKey(key, "")).rejects.toThrow(
        "Key wrap failed: recipient identifier is required.",
      );
      await expect(wrapAESKey(key, "   ")).rejects.toThrow(
        "Key wrap failed: recipient identifier is required.",
      );
      await expect(getPublicKeyForAddress("")).rejects.toThrow(
        "Unknown address: identifier is required.",
      );
    });
  });

  describe("6. Large Payload Stability & Boundary Tests (Acceptance Criteria)", () => {
    it("handles step-ladder payload sizes (1 KB, 8 KB, 16 KB, 32 KB, and 60 KB)", async () => {
      const key = await generateAESKey();
      const sizesInKb = [1, 8, 16, 32, 60];

      for (const sizeKb of sizesInKb) {
        // Construct string payload of approximate size
        const charCount = sizeKb * 1024 - 100; // room for json wrapper
        const payload = {
          sizeKb,
          data: "A".repeat(Math.max(1, charCount)),
        };

        const envelope = await encryptPayload(payload, key);
        expect(typeof envelope).toBe("string");

        const decrypted = (await decryptPayload(envelope, key)) as {
          sizeKb: number;
          data: string;
        };

        expect(decrypted.sizeKb).toBe(sizeKb);
        expect(decrypted.data.length).toBe(payload.data.length);
        expect(decrypted.data).toBe(payload.data);
      }
    });

    it("handles complex large affiliate batch datasets with deep nesting", async () => {
      const key = await generateAESKey();

      // Create an affiliate batch of 75 conversions
      const conversions = Array.from({ length: 75 }, (_, i) => ({
        index: i + 1,
        txHash: `0x${i.toString(16).padStart(64, "0")}`,
        orderId: `ORD-2026-${(10000 + i).toString()}`,
        amountUsd: (50 + i * 2.5).toFixed(2),
        commissionRate: "0.10",
        payoutAddress: `GBBD${i.toString().padStart(48, "X")}`,
        customerMeta: {
          ipCountry: "US",
          device: "desktop",
          clickId: `CLK-${i}`,
          auditLog: [`created_${i}`, `verified_${i}`, `escrow_locked_${i}`],
        },
      }));

      const largePayload = {
        batchId: "BATCH-STORM-2026-Q4",
        totalCount: conversions.length,
        conversions,
      };

      const envelope = await encryptPayload(largePayload, key);
      const decrypted = await decryptPayload(envelope, key);
      expect(decrypted).toEqual(largePayload);
    });

    it("enforces maximum plaintext payload size of 64 KB (MAX_PLAINTEXT_BYTES)", async () => {
      const key = await generateAESKey();

      // Construct a payload strictly exceeding 64 KB (65,536 bytes)
      const oversizedPayload = {
        oversizedData: "X".repeat(66 * 1024),
      };

      await expect(encryptPayload(oversizedPayload, key)).rejects.toThrow(
        "Encryption failed: payload size out of bounds.",
      );
    });

    it("rejects envelopes exceeding the maximum envelope character limit (200,000 characters)", async () => {
      const key = await generateAESKey();
      const oversizedEnvelope = "A".repeat(200_001);

      await expect(decryptPayload(oversizedEnvelope, key)).rejects.toThrow(
        "Decryption failed: invalid payload or key.",
      );
    });
  });

  describe("7. Concurrency & Stress Stability", () => {
    it("executes 30 concurrent asynchronous encrypt and decrypt operations safely", async () => {
      const key = await generateAESKey();

      const items = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        randomPayload: `concurrent-test-string-${i}-${Math.random().toString(36)}`,
        timestamp: Date.now() + i,
      }));

      // Concurrent encryption
      const encryptedResults = await Promise.all(items.map((item) => encryptPayload(item, key)));

      expect(encryptedResults).toHaveLength(30);

      // Concurrent decryption
      const decryptedResults = await Promise.all(
        encryptedResults.map((enc) => decryptPayload(enc, key)),
      );

      expect(decryptedResults).toEqual(items);
    });
  });

  describe("8. Defensive Input Validation & Boundary Guards", () => {
    it("rejects non-object and array payloads from encryption", async () => {
      const key = await generateAESKey();

      // Arrays are objects in JS but not allowed as root payload
      await expect(encryptPayload([1, 2, 3] as unknown as object, key)).rejects.toThrow(
        "Encryption failed: payload must be a JSON object.",
      );

      // Null
      await expect(encryptPayload(null as unknown as object, key)).rejects.toThrow(
        "Encryption failed: payload must be a JSON object.",
      );

      // Primitive types passed as object
      await expect(encryptPayload("string" as unknown as object, key)).rejects.toThrow(
        "Encryption failed: payload must be a JSON object.",
      );
      await expect(encryptPayload(12345 as unknown as object, key)).rejects.toThrow(
        "Encryption failed: payload must be a JSON object.",
      );
      await expect(encryptPayload(true as unknown as object, key)).rejects.toThrow(
        "Encryption failed: payload must be a JSON object.",
      );
    });
  });
});
