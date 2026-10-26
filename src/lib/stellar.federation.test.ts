import { describe, it, expect, vi, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  discoverFederationServer,
  isFederatedAddress,
  parseFederatedAddress,
  resolveFederatedAddress,
  resolveRecipient,
} from "./stellar";

const VALID_PUBLIC_KEY = Keypair.random().publicKey();

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const tomlResponse = (toml: string, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => toml,
  json: async () => ({}),
});

const STELLAR_TOML = `
ACCOUNTS = []
VERSION = "1.0.0"
FEDERATION_SERVER = "https://stormsale.io/federation"
`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Federation address parsing", () => {
  it("accepts name*domain.com federation addresses", () => {
    expect(isFederatedAddress("alice*stormsale.io")).toBe(true);
    expect(isFederatedAddress("bob.smith*stellar.org")).toBe(true);
    expect(isFederatedAddress("  carol_42*sub.stormsale.io  ")).toBe(true);
  });

  it("rejects raw keys, missing domains, and malformed addresses", () => {
    expect(isFederatedAddress(VALID_PUBLIC_KEY)).toBe(false);
    expect(isFederatedAddress("alice")).toBe(false);
    expect(isFederatedAddress("alice*")).toBe(false);
    expect(isFederatedAddress("*stormsale.io")).toBe(false);
    expect(isFederatedAddress("alice*stormsale")).toBe(false);
    expect(isFederatedAddress("alice @stormsale.io")).toBe(false);
    expect(isFederatedAddress("")).toBe(false);
  });

  it("splits the username and lowercases the domain", () => {
    expect(parseFederatedAddress("Alice*StormSale.IO")).toEqual({
      username: "Alice",
      domain: "stormsale.io",
    });
    expect(parseFederatedAddress(VALID_PUBLIC_KEY)).toBeNull();
    expect(parseFederatedAddress("not-an-address")).toBeNull();
  });
});

describe("discoverFederationServer", () => {
  it("reads FEDERATION_SERVER from the domain stellar.toml", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tomlResponse(STELLAR_TOML));
    vi.stubGlobal("fetch", fetchMock);

    await expect(discoverFederationServer("stormsale.io")).resolves.toBe(
      "https://stormsale.io/federation",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://stormsale.io/.well-known/stellar.toml",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("throws when stellar.toml does not declare a federation server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tomlResponse('VERSION = "1.0.0"')));
    await expect(discoverFederationServer("stormsale.io")).rejects.toThrow(/FEDERATION_SERVER/);
  });

  it("throws when stellar.toml is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tomlResponse("", 404)));
    await expect(discoverFederationServer("stormsale.io")).rejects.toThrow(/HTTP 404/);
  });
});

describe("resolveFederatedAddress", () => {
  it("resolves a federated address to an ed25519 key with memo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tomlResponse(STELLAR_TOML))
      .mockResolvedValueOnce(
        jsonResponse({
          stellar_address: "alice*stormsale.io",
          account_id: VALID_PUBLIC_KEY,
          memo_type: "id",
          memo: 1001,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const record = await resolveFederatedAddress("alice*stormsale.io");
    expect(record.accountId).toBe(VALID_PUBLIC_KEY);
    expect(record.federatedAddress).toBe("alice*stormsale.io");
    expect(record.memoType).toBe("id");
    expect(record.memo).toBe("1001");

    // Second request hits the federation server with the correct query params.
    const federationUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(federationUrl.pathname).toBe("/federation");
    expect(federationUrl.searchParams.get("q")).toBe("alice*stormsale.io");
    expect(federationUrl.searchParams.get("type")).toBe("name");
  });

  it("uses an explicit federation server override without reading stellar.toml", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ account_id: VALID_PUBLIC_KEY }));
    vi.stubGlobal("fetch", fetchMock);

    const record = await resolveFederatedAddress("alice*stormsale.io", {
      federationServer: "https://custom.example/fed",
    });
    expect(record.accountId).toBe(VALID_PUBLIC_KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid federation addresses before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveFederatedAddress("not-federated")).rejects.toThrow(/Invalid federation/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the federation server returns a non-ed25519 account id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tomlResponse(STELLAR_TOML))
      .mockResolvedValueOnce(jsonResponse({ account_id: "CBAD" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveFederatedAddress("alice*stormsale.io")).rejects.toThrow(
      /valid ed25519 account id/,
    );
  });
});

describe("resolveRecipient graceful fallback", () => {
  it("passes through a raw public key without hitting the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveRecipient(VALID_PUBLIC_KEY)).resolves.toEqual({
      status: "raw",
      address: VALID_PUBLIC_KEY,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a federated resolution for a reachable federation server", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(tomlResponse(STELLAR_TOML))
        .mockResolvedValueOnce(
          jsonResponse({ account_id: VALID_PUBLIC_KEY, stellar_address: "alice*stormsale.io" }),
        ),
    );

    const resolution = await resolveRecipient("alice*stormsale.io");
    expect(resolution.status).toBe("federated");
    expect(resolution.address).toBe(VALID_PUBLIC_KEY);
  });

  it("falls back to unresolved (never throws) when federation lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const resolution = await resolveRecipient("alice*stormsale.io");
    expect(resolution.status).toBe("unresolved");
    expect(resolution.error).toBeDefined();
    expect(resolution.address).toBeUndefined();
  });

  it("flags malformed and empty input as invalid", async () => {
    await expect(resolveRecipient("garbage input")).resolves.toMatchObject({ status: "invalid" });
    await expect(resolveRecipient("")).resolves.toMatchObject({ status: "invalid" });
  });
});
