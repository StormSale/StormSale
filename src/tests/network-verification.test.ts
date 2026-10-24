import { afterEach, describe, expect, it, vi } from "vitest";
import { getNetwork } from "@stellar/freighter-api";
import { verifyFreighterNetwork } from "../lib/networkVerification";

vi.mock("@stellar/freighter-api", () => ({
  getNetwork: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("Freighter network verification", () => {
  it("returns the verified Stellar Testnet network", async () => {
    vi.mocked(getNetwork).mockResolvedValue({ network: "TESTNET" } as Awaited<
      ReturnType<typeof getNetwork>
    >);

    await expect(verifyFreighterNetwork()).resolves.toEqual({
      network: "TESTNET",
      isStellarNetwork: true,
    });
  });

  it("does not label a verifiable non-Stellar network as Stellar", async () => {
    vi.mocked(getNetwork).mockResolvedValue({ network: "FUTURENET" } as Awaited<
      ReturnType<typeof getNetwork>
    >);

    await expect(verifyFreighterNetwork()).resolves.toEqual({
      network: "FUTURENET",
      isStellarNetwork: false,
    });
  });

  it("returns null when the wallet network cannot be read", async () => {
    vi.mocked(getNetwork).mockResolvedValue({ error: new Error("Wallet unavailable") } as Awaited<
      ReturnType<typeof getNetwork>
    >);

    await expect(verifyFreighterNetwork()).resolves.toBeNull();
  });

  it("returns null when the wallet API rejects", async () => {
    vi.mocked(getNetwork).mockRejectedValue(new Error("Wallet unavailable"));

    await expect(verifyFreighterNetwork()).resolves.toBeNull();
  });
});
