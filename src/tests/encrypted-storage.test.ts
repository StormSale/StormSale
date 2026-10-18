import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  encryptedStorage,
  setEncryptedItem,
  getEncryptedItem,
  removeEncryptedItem,
  purgeOnLogout,
  onStoragePurged,
  hashStorageKey,
  getLocalStorage,
  STORAGE_PREFIX,
} from "../lib/storage";

describe("Encrypted Local Cache Layer Suite", () => {
  const storage = getLocalStorage();

  beforeEach(async () => {
    storage.clear();
    await purgeOnLogout();
  });

  it("hashes and encrypts storage keys so plaintext keys are never exposed in localStorage", async () => {
    const sensitiveKey = "advertiser_auth_token";
    const secretData = { token: "secret_token_123", role: "merchant" };

    await setEncryptedItem(sensitiveKey, secretData);

    // Plaintext key MUST NOT exist in localStorage
    expect(storage.getItem(sensitiveKey)).toBeNull();

    // Hashed key MUST exist in localStorage with prefix
    const hashedKey = await hashStorageKey(sensitiveKey);
    expect(hashedKey.startsWith(STORAGE_PREFIX)).toBe(true);
    const rawStored = storage.getItem(hashedKey);
    expect(rawStored).not.toBeNull();

    // Plaintext value MUST NOT be present in raw stored payload
    expect(rawStored).not.toContain("secret_token_123");
    expect(rawStored).not.toContain("merchant");

    // Stored structure must have IV and ciphertext data
    const parsed = JSON.parse(rawStored!);
    expect(parsed.v).toBe(1);
    expect(Array.isArray(parsed.iv)).toBe(true);
    expect(parsed.iv.length).toBe(12);
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data.length).toBeGreaterThan(0);
  });

  it("encrypts and decrypts complex objects and primitives accurately", async () => {
    const complexPayload = {
      campaignId: "camp_987",
      budget: 15000000n.toString(),
      metadata: {
        tags: ["crypto", "stellar", "affiliate"],
        enabled: true,
      },
    };

    await setEncryptedItem("campaign_cache", complexPayload);
    const retrieved = await getEncryptedItem<typeof complexPayload>("campaign_cache");

    expect(retrieved).toEqual(complexPayload);

    // Primitives
    await setEncryptedItem("active_step", 3);
    expect(await getEncryptedItem<number>("active_step")).toBe(3);

    await setEncryptedItem("flag_active", true);
    expect(await getEncryptedItem<boolean>("flag_active")).toBe(true);

    await setEncryptedItem("text_note", "Decentralized affiliate protocol");
    expect(await getEncryptedItem<string>("text_note")).toBe("Decentralized affiliate protocol");
  });

  it("returns null gracefully when key does not exist or data is corrupted", async () => {
    const nonExistent = await getEncryptedItem("non_existent_key");
    expect(nonExistent).toBeNull();

    // Corrupt data under hashed key
    const hashedKey = await hashStorageKey("corrupt_key");
    storage.setItem(hashedKey, JSON.stringify({ v: 1, iv: [1, 2, 3], data: [9, 9, 9] }));

    const corrupted = await getEncryptedItem("corrupt_key");
    expect(corrupted).toBeNull();
  });

  it("removes individual encrypted items correctly", async () => {
    await setEncryptedItem("temp_key", "temporary_value");
    expect(await getEncryptedItem("temp_key")).toBe("temporary_value");

    await removeEncryptedItem("temp_key");
    expect(await getEncryptedItem("temp_key")).toBeNull();

    const hashedKey = await hashStorageKey("temp_key");
    expect(storage.getItem(hashedKey)).toBeNull();
  });

  it("automatically purges all encrypted storage items and dispatches event on security logout", async () => {
    const purgeListener = vi.fn();
    const unsubscribe = onStoragePurged(purgeListener);

    // Seed multiple encrypted items and one unrelated plaintext item
    await setEncryptedItem("user_session", { user: "GD5...XYZ" });
    await setEncryptedItem("wallet_credentials", { id: "vault_1" });
    await setEncryptedItem("cached_preferences", { dark: true });
    storage.setItem("unencrypted_public_flag", "true");

    // Pre-condition
    expect(await getEncryptedItem("user_session")).not.toBeNull();
    expect(await getEncryptedItem("wallet_credentials")).not.toBeNull();

    // Trigger security purge
    await purgeOnLogout();

    // All encrypted items MUST be gone
    expect(await getEncryptedItem("user_session")).toBeNull();
    expect(await getEncryptedItem("wallet_credentials")).toBeNull();
    expect(await getEncryptedItem("cached_preferences")).toBeNull();

    // Unrelated items remain untouched
    expect(storage.getItem("unencrypted_public_flag")).toBe("true");

    // Security purge event MUST have been dispatched
    expect(purgeListener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("operates reliably through unified encryptedStorage object interface", async () => {
    await encryptedStorage.setItem("unified_test", { ok: true });
    const res = await encryptedStorage.getItem<{ ok: boolean }>("unified_test");
    expect(res?.ok).toBe(true);

    await encryptedStorage.removeItem("unified_test");
    expect(await encryptedStorage.getItem("unified_test")).toBeNull();
  });
});
