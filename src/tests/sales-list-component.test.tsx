// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  SalesList,
  calculateClearing,
  formatTimestamp,
  formatUtcTimestamp,
  filterAndSortSales,
  escapeCsvField,
  mapHorizonPaymentsToSales,
  getSaleStatus,
  type SaleRecord,
  type HorizonPaymentRecord,
} from "../components/affiliate/SalesList";
import { CONTRACT_ADDRESSES } from "../config/contracts";
import { SALES_LEDGER } from "./fixtures/salesLedger";

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: "GADNSF7745EV3D5IRWBRN6OYXMR2YYAEGLDMULGTGDKKSBVXWMMVNPW6",
  }),
}));

vi.mock("../utils/network", () => ({
  verifyHorizonConnectivity: vi.fn().mockResolvedValue(true),
  getStellarExplorerLink: (type: string, val: string) =>
    `https://stellar.expert/explorer/testnet/${type}/${val}`,
}));

vi.mock("../config/stellar", () => ({
  STELLAR_CONFIG: {
    horizonUrl: "https://horizon-testnet.stellar.org",
    network: "TESTNET",
    explorerUrl: "https://stellar.expert/explorer/testnet",
  },
}));

vi.mock("../lib/stellar", () => ({
  isValidStellarAddress: (addr: unknown) =>
    typeof addr === "string" && (addr.startsWith("G") || addr.startsWith("C")) && addr.length === 56,
}));

vi.mock("../lib/crypto", () => ({
  decryptPayload: vi.fn().mockResolvedValue({ saleId: 888, secret: "ok" }),
  generateAESKey: vi.fn().mockResolvedValue("mock-aes-key"),
  encryptPayload: vi.fn().mockResolvedValue("mock-encrypted-envelope"),
  wrapAESKey: vi.fn().mockResolvedValue("mock-wrapped-key"),
  unwrapAESKey: vi.fn().mockResolvedValue("mock-unwrapped-key"),
  getPublicKeyForAddress: vi.fn().mockResolvedValue("mock-pub-key"),
}));

describe("SalesList Component & Rendering Suite (#51, #55, #95)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Clearing Countdown Calculations", () => {
    it("handles matured state and percentage clamping", () => {
      const now = 1000000;
      const matured = calculateClearing({ timestamp: now - 700000, clearingPeriod: 604800 }, now);
      expect(matured.isUnlocked).toBe(true);
      expect(matured.progressPercent).toBe(100);
      expect(matured.remainingSeconds).toBe(0);
    });

    it("formats countdowns for days, hours, minutes, and seconds", () => {
      const now = 1000000;

      // > 1 day
      const days = calculateClearing({ timestamp: now, clearingPeriod: 86400 * 2 + 3600 * 3 }, now);
      expect(days.countdownText).toContain("2d 3h");
      expect(days.progressPercent).toBeLessThanOrEqual(99);

      // < 1 day, > 1 hour
      const hours = calculateClearing({ timestamp: now, clearingPeriod: 3600 * 4 + 60 * 10 }, now);
      expect(hours.countdownText).toContain("4h 10m");

      // < 1 hour, > 1 min
      const mins = calculateClearing({ timestamp: now, clearingPeriod: 60 * 25 + 30 }, now);
      expect(mins.countdownText).toContain("25m 30s");

      // < 1 min
      const secs = calculateClearing({ timestamp: now, clearingPeriod: 42 }, now);
      expect(secs.countdownText).toBe("42s");
    });
  });

  describe("Formatting and Sanitization Helpers", () => {
    it("formats timestamps into UTC and local strings", () => {
      const ts = 1760000000;
      expect(formatTimestamp(ts)).toBeTruthy();
      expect(formatUtcTimestamp(ts)).toContain("UTC");
    });

    it("determines status consistently using getSaleStatus", () => {
      expect(getSaleStatus({ status: "claimed", claimed: false } as SaleRecord)).toBe("claimed");
      expect(getSaleStatus({ status: "processing", claimed: true } as SaleRecord)).toBe("processing");
      expect(getSaleStatus({ claimed: true } as SaleRecord)).toBe("claimed");
      expect(getSaleStatus({ claimed: false } as SaleRecord)).toBe("pending");
      expect(getSaleStatus({} as SaleRecord)).toBe("pending");
    });

    it("escapes CSV values and neutralizes spreadsheet formula injection", () => {
      expect(escapeCsvField(null)).toBe("");
      expect(escapeCsvField(undefined)).toBe("");
      expect(escapeCsvField("simple")).toBe("simple");

      // Formula characters: =, +, -, @, \t, \r
      expect(escapeCsvField("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
      expect(escapeCsvField("+12345")).toBe("'+12345");
      expect(escapeCsvField("-danger")).toBe("'-danger");
      expect(escapeCsvField("@eval")).toBe("'@eval");

      // Quotes, commas, and newlines
      expect(escapeCsvField('has "quotes"')).toBe('"has ""quotes"""');
      expect(escapeCsvField("has,comma")).toBe('"has,comma"');
      expect(escapeCsvField("has\nnewline")).toBe('"has\nnewline"');
    });

    it("handles edge cases in mapHorizonPaymentsToSales and filterAndSortSales", () => {
      // invalid stellar address returns empty array
      expect(mapHorizonPaymentsToSales([], "not-an-address")).toEqual([]);

      // default/unknown sortBy returns 0 in sort comparator
      const sorted = filterAndSortSales(SALES_LEDGER, { sortBy: "custom" as any });
      expect(sorted.length).toBe(SALES_LEDGER.length);

      // mapHorizonPaymentsToSales with campaign_id, campaign_name, memo
      const recs: HorizonPaymentRecord[] = [
        {
          id: "op-extra",
          type: "invoke_host_function",
          created_at: "2026-10-15T12:00:00Z",
          campaign_id: 42,
          campaign_name: "Special Campaign",
          memo: "Special Memo",
          asset_balance_changes: [
            {
              type: "transfer",
              asset_type: "native",
              from: CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
              to: "GADNSF7745EV3D5IRWBRN6OYXMR2YYAEGLDMULGTGDKKSBVXWMMVNPW6",
              amount: "100.0",
            },
          ],
        },
      ];
      const mapped = mapHorizonPaymentsToSales(
        recs,
        "GADNSF7745EV3D5IRWBRN6OYXMR2YYAEGLDMULGTGDKKSBVXWMMVNPW6",
      );
      expect(mapped[0].campaignId).toBe(42);
      expect(mapped[0].campaignName).toBe("Special Campaign");
      expect(mapped[0].memo).toBe("Special Memo");
    });
  });

  describe("Interactive Component Rendering & User Actions", () => {
    it("renders full ledger table with summary cards, badges, and rows", () => {
      render(<SalesList sales={SALES_LEDGER} />);

      // Headers and verification badge
      expect(screen.getByText("Auditable Payout & History Ledger")).toBeTruthy();
      expect(screen.getByText("Verified Ledger")).toBeTruthy();
      expect(screen.getByText("Export CSV")).toBeTruthy();

      // Metric cards
      expect(screen.getByText("Total Sales Volume")).toBeTruthy();
      expect(screen.getByText("Settled Commissions")).toBeTruthy();
      expect(screen.getByText("Pending in Escrow")).toBeTruthy();
      expect(screen.getByText("On-Chain Verified")).toBeTruthy();

      // Filter controls
      expect(screen.getByLabelText("Sort ledger entries")).toBeTruthy();

      // Table rows
      expect(screen.getAllByText("Tech Gadgets Pro").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Web3 Masterclass 2026")).toBeTruthy();
      expect(screen.getByText("Crypto Security Hardware")).toBeTruthy();
    });

    it("filters transactions when status tabs are clicked", () => {
      render(<SalesList sales={SALES_LEDGER} />);

      // Click Claimed
      fireEvent.click(screen.getByText(/Claimed \(/i));
      expect(screen.getByText("Web3 Masterclass 2026")).toBeTruthy();

      // Click Pending
      fireEvent.click(screen.getByText(/Pending \(/i));
      expect(screen.getByText("DeFi Yield Aggregator")).toBeTruthy();

      // Click Processing
      fireEvent.click(screen.getByText(/Processing \(/i));
      expect(screen.getByText("Tech Gadgets Pro")).toBeTruthy();

      // Click All
      fireEvent.click(screen.getByText(/All \(/i));
      expect(screen.getByText("Crypto Security Hardware")).toBeTruthy();
    });

    it("filters transactions by search query", () => {
      render(<SalesList sales={SALES_LEDGER} />);

      const searchInput = screen.getByPlaceholderText(/Search by Sale ID/i);
      fireEvent.change(searchInput, { target: { value: "Security Hardware" } });
      expect(screen.getByText("Crypto Security Hardware")).toBeTruthy();
      expect(screen.queryByText("Web3 Masterclass 2026")).toBeNull();
    });

    it("sorts transactions by different criteria", () => {
      render(<SalesList sales={SALES_LEDGER} />);

      const sortSelect = screen.getByLabelText("Sort ledger entries");
      fireEvent.change(sortSelect, { target: { value: "oldest" } });
      fireEvent.change(sortSelect, { target: { value: "highest_commission" } });
      fireEvent.change(sortSelect, { target: { value: "highest_amount" } });
    });

    it("triggers CSV export when Export CSV button is clicked", () => {
      render(<SalesList sales={SALES_LEDGER} />);

      const exportBtn = screen.getByText("Export CSV");
      fireEvent.click(exportBtn);
      expect(window.URL.createObjectURL).toHaveBeenCalled();
      expect(window.URL.revokeObjectURL).toHaveBeenCalled();
    });

    it("renders empty state when no transactions match", () => {
      render(<SalesList sales={[]} />);
      expect(screen.getByText("No transactions found matching your criteria.")).toBeTruthy();
    });

    it("renders connect wallet message when no sales provided and userAddress is null", () => {
      render(<SalesList sales={undefined} userAddress={null} />);
      expect(screen.getByText("Connect Wallet to Inspect Ledger")).toBeTruthy();
      expect(
        screen.getByText(/Connect your Stellar account to query on-chain settlement payouts/i),
      ).toBeTruthy();
    });

    it("opens receipt modal, displays transaction details, copies tx hash, and closes modal", async () => {
      const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          successful: true,
          ledger: 98765,
          fee_charged: "100",
        }),
      } as Response);

      render(<SalesList sales={SALES_LEDGER} />);

      const viewReceiptButtons = screen.getAllByText("View Receipt");
      fireEvent.click(viewReceiptButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Stellar Payout Receipt")).toBeTruthy();
      });

      // Copy Tx Hash
      const copyBtn = screen.getByTitle("Copy transaction hash");
      fireEvent.click(copyBtn);
      expect(navigator.clipboard.writeText).toHaveBeenCalled();

      // Close modal
      const closeBtn = screen.getByText("Close Receipt");
      fireEvent.click(closeBtn);

      mockFetch.mockRestore();
    });

    it("opens decrypt dialog and decrypts sale data successfully", async () => {
      const saleWithEncrypted: SaleRecord = {
        ...SALES_LEDGER[0],
        id: 888,
        encryptedPayload: "mock-encrypted-payload-string",
        wrappedKey: "mock-wrapped-key",
      };
      render(<SalesList sales={[saleWithEncrypted]} />);

      const decryptBtn = screen.getByText("Decrypt");
      fireEvent.click(decryptBtn);

      await waitFor(() => {
        expect(screen.getByText("Decrypted Sale Data")).toBeTruthy();
      });
    });

    it("handles Horizon synchronization on mount and displays error on failure, then succeeds on Retry Sync", async () => {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new Error("Network Error"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            _embedded: {
              records: [
                {
                  id: "op-retry",
                  type: "invoke_host_function",
                  created_at: "2026-10-15T12:00:00Z",
                  asset_balance_changes: [
                    {
                      type: "transfer",
                      asset_type: "native",
                      from: CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
                      to: "GADNSF7745EV3D5IRWBRN6OYXMR2YYAEGLDMULGTGDKKSBVXWMMVNPW6",
                      amount: "99.0",
                    },
                  ],
                },
              ],
            },
          }),
        } as Response);

      render(
        <SalesList
          sales={undefined}
          userAddress="GADNSF7745EV3D5IRWBRN6OYXMR2YYAEGLDMULGTGDKKSBVXWMMVNPW6"
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("Failed to fetch on-chain settlement records from Horizon node."),
        ).toBeTruthy();
      });

      // Click Retry Sync (covers loadLedger)
      const retryBtn = screen.getByText("Retry Sync");
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(
          screen.queryByText("Failed to fetch on-chain settlement records from Horizon node."),
        ).toBeNull();
      });

      mockFetch.mockRestore();
    });

    it("handles decrypt when key needs to be generated on the fly", async () => {
      const saleNeedingKey: SaleRecord = {
        ...SALES_LEDGER[0],
        id: 999,
        encryptedPayload: "mock-encrypted-string",
      };
      render(<SalesList sales={[saleNeedingKey]} />);

      const decryptBtn = screen.getByText("Decrypt");
      fireEvent.click(decryptBtn);

      await waitFor(() => {
        expect(screen.getByText("Decrypted Sale Data")).toBeTruthy();
      });
    });

    it("displays error when decryption throws", async () => {
      const crypto = await import("../lib/crypto");
      vi.spyOn(crypto, "unwrapAESKey").mockRejectedValueOnce(new Error("Tampered"));

      const saleTampered: SaleRecord = {
        ...SALES_LEDGER[0],
        id: 777,
        encryptedPayload: "bad-payload",
        wrappedKey: "bad-key",
      };
      render(<SalesList sales={[saleTampered]} />);

      const decryptBtn = screen.getByText("Decrypt");
      fireEvent.click(decryptBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Unable to decrypt this sale. The payload may be tampered/i),
        ).toBeTruthy();
      });
    });
  });
});
