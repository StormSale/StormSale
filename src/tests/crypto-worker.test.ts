import { describe, expect, it } from "vitest";
import { handleCryptoWorkerRequest } from "../lib/cryptoWorkerProtocol";

describe("crypto worker message bridge", () => {
  it("round-trips an AES payload through worker requests", async () => {
    const generated = await handleCryptoWorkerRequest({ id: 1, operation: "generate-key" });
    expect(generated.error).toBeUndefined();
    const key = generated.result as CryptoKey;

    const encrypted = await handleCryptoWorkerRequest({
      id: 2,
      operation: "encrypt",
      payload: { saleId: 77, amount: "10.00" },
      key,
    });
    expect(encrypted.error).toBeUndefined();

    const decrypted = await handleCryptoWorkerRequest({
      id: 3,
      operation: "decrypt",
      encryptedPayload: encrypted.result as string,
      key,
    });
    expect(decrypted).toEqual({ id: 3, result: { saleId: 77, amount: "10.00" } });
  });

  it("returns serializable errors for invalid requests", async () => {
    await expect(handleCryptoWorkerRequest({ id: 4, operation: "encrypt" })).resolves.toEqual({
      id: 4,
      error: "Missing encryption input.",
    });
  });
});
