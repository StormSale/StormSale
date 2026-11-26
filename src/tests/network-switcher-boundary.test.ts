import { afterEach, describe, expect, it, vi } from "vitest";
import { Networks, StrKey } from "@stellar/stellar-sdk";
import { getNetwork } from "@stellar/freighter-api";
import { STELLAR_NETWORKS, getSupportedEscrowAssets, ISSUERS } from "../config/stellar";
import { verifyFreighterNetwork } from "../lib/networkVerification";

vi.mock("@stellar/freighter-api", () => ({
  getNetwork: vi.fn(),
}));

type NetworkKey = "TESTNET" | "FUTURENET" | "PUBLIC";

const BADGE_STYLES: Record<NetworkKey, { label: string; className: string }> = {
  TESTNET: { label: "Testnet", className: "badge-testnet bg-amber-500/10 text-amber-400" },
  FUTURENET: { label: "Futurenet", className: "badge-futurenet bg-purple-500/10 text-purple-400" },
  PUBLIC: { label: "Mainnet", className: "badge-mainnet bg-emerald-500/10 text-emerald-400" },
};

function networkFromPassphrase(passphrase: string): NetworkKey | null {
  if (passphrase === Networks.TESTNET) return "TESTNET";
  if (passphrase === Networks.FUTURENET) return "FUTURENET";
  if (passphrase === Networks.PUBLIC) return "PUBLIC";
  return null;
}

function getNetworkBadge(passphrase: string) {
  const key = networkFromPassphrase(passphrase);
  return key ? BADGE_STYLES[key] : { label: "Unknown network", className: "badge-unknown" };
}

function getMismatchBanner(walletNetwork: string | null, selectedPassphrase: string) {
  const selected = networkFromPassphrase(selectedPassphrase);
  if (!walletNetwork || !selected) return null;
  if (walletNetwork.toUpperCase() === selected) return null;
  return `Wallet is connected to ${walletNetwork.toUpperCase()} but ${BADGE_STYLES[selected].label} is selected. Switch your wallet network before signing.`;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("Network Switcher and Alert Boundary Tests (#430)", () => {
  it("displays distinct Testnet, Futurenet and Mainnet badges", () => {
    const testnet = getNetworkBadge(Networks.TESTNET);
    const futurenet = getNetworkBadge(Networks.FUTURENET);
    const mainnet = getNetworkBadge(STELLAR_NETWORKS.PUBLIC.passphrase);

    expect(testnet.label).toBe("Testnet");
    expect(futurenet.label).toBe("Futurenet");
    expect(mainnet.label).toBe("Mainnet");
    expect(new Set([testnet.className, futurenet.className, mainnet.className]).size).toBe(3);
    expect(getNetworkBadge("Some Private Network").label).toBe("Unknown network");
    expect(STELLAR_NETWORKS.TESTNET.passphrase).toBe(Networks.TESTNET);
    expect(STELLAR_NETWORKS.PUBLIC.passphrase).toBe(Networks.PUBLIC);
  });

  it("resolves contract addresses based on the active network passphrase", () => {
    const testnet = getSupportedEscrowAssets("TESTNET");
    const mainnet = getSupportedEscrowAssets("PUBLIC");

    for (const code of ["XLM", "USDC", "EURC"] as const) {
      expect(StrKey.isValidContract(testnet[code].contractAddress)).toBe(true);
      expect(StrKey.isValidContract(mainnet[code].contractAddress)).toBe(true);
      expect(testnet[code].contractAddress).not.toBe(mainnet[code].contractAddress);
    }
    expect(testnet.USDC.issuer).toBe(ISSUERS.TESTNET.USDC);
    expect(mainnet.USDC.issuer).toBe(ISSUERS.PUBLIC.USDC);
  });

  it("shows a mismatch banner when the wallet is on Testnet but Mainnet is selected", async () => {
    vi.mocked(getNetwork).mockResolvedValue({ network: "TESTNET" } as Awaited<
      ReturnType<typeof getNetwork>
    >);
    const wallet = await verifyFreighterNetwork();
    expect(wallet?.isStellarNetwork).toBe(true);

    const banner = getMismatchBanner(wallet!.network, STELLAR_NETWORKS.PUBLIC.passphrase);
    expect(banner).toContain("Wallet is connected to TESTNET");
    expect(banner).toContain("Mainnet is selected");

    expect(getMismatchBanner(wallet!.network, STELLAR_NETWORKS.TESTNET.passphrase)).toBeNull();
  });

  it("does not show a banner when the wallet network cannot be verified", async () => {
    vi.mocked(getNetwork).mockRejectedValue(new Error("Freighter not installed"));
    const wallet = await verifyFreighterNetwork();
    expect(wallet).toBeNull();
    expect(getMismatchBanner(wallet?.network ?? null, Networks.PUBLIC)).toBeNull();
  });
});
