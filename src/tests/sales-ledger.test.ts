import { describe, it, expect, vi } from "vitest";
import { getStellarExplorerLink } from "../utils/network";
import {
  filterAndSortSales,
  escapeCsvField,
  isValidStellarAddress,
  isValidTxHash,
  mapHorizonPaymentsToSales,
  fetchHorizonSettlements,
  type SaleRecord,
  type HorizonPaymentRecord,
} from "../components/affiliate/SalesList";
import { CONTRACT_ADDRESSES } from "../config/contracts";
import { SALES_LEDGER } from "./fixtures/salesLedger";

describe("Auditable Payout & History Ledger Suite (#51)", () => {
  it("filters ledger records by status using exported filterAndSortSales", () => {
    const claimed = filterAndSortSales(SALES_LEDGER, { statusFilter: "claimed" });
    expect(claimed.length).toBe(3);
    expect(claimed.every((s) => s.status === "claimed")).toBe(true);

    const pending = filterAndSortSales(SALES_LEDGER, { statusFilter: "pending" });
    expect(pending.length).toBe(1);
    expect(pending[0].status).toBe("pending");

    const processing = filterAndSortSales(SALES_LEDGER, { statusFilter: "processing" });
    expect(processing.length).toBe(1);
    expect(processing[0].status).toBe("processing");
  });

  it("searches ledger by sale ID (#102), campaign name, or transaction hash using filterAndSortSales", () => {
    // Search by #ID
    const searchByHashId = filterAndSortSales(SALES_LEDGER, { searchQuery: "#102" });
    expect(searchByHashId.length).toBe(1);
    expect(searchByHashId[0].campaignName).toBe("Web3 Masterclass 2026");

    // Search by plain numeric ID
    const searchById = filterAndSortSales(SALES_LEDGER, { searchQuery: "104" });
    expect(searchById.length).toBe(1);
    expect(searchById[0].id).toBe(104);

    // Search by Campaign name substring
    const searchByCampaign = filterAndSortSales(SALES_LEDGER, { searchQuery: "Tech Gadgets" });
    expect(searchByCampaign.length).toBe(2);

    // Search by TxHash prefix
    const searchByTx = filterAndSortSales(SALES_LEDGER, { searchQuery: "e3b0c442" });
    expect(searchByTx.length).toBe(1);
    expect(searchByTx[0].id).toBe(101);
  });

  it("sorts ledger entries by commission amount, sale amount, and timestamp", () => {
    const sortedByCommission = filterAndSortSales(SALES_LEDGER, {
      sortBy: "highest_commission",
    });
    expect(sortedByCommission[0].id).toBe(104); // 80.0 XLM
    expect(sortedByCommission[1].id).toBe(103); // 45.0 XLM
    expect(sortedByCommission[sortedByCommission.length - 1].id).toBe(101); // 10.0 XLM

    const sortedByAmount = filterAndSortSales(SALES_LEDGER, {
      sortBy: "highest_amount",
    });
    expect(sortedByAmount[0].id).toBe(104); // 800.0 XLM
    expect(sortedByAmount[1].id).toBe(103); // 450.0 XLM

    const sortedOldest = filterAndSortSales(SALES_LEDGER, { sortBy: "oldest" });
    expect(sortedOldest[0].timestamp).toBeLessThanOrEqual(
      sortedOldest[sortedOldest.length - 1].timestamp,
    );
  });

  it("escapes CSV fields and neutralizes spreadsheet formula prefixes", () => {
    // Normal string
    expect(escapeCsvField("Tech Gadgets")).toBe("Tech Gadgets");

    // String with comma
    expect(escapeCsvField("Gadgets, Electronics")).toBe('"Gadgets, Electronics"');

    // String with quotes (doubled)
    expect(escapeCsvField('Super "Pro" Gadget')).toBe('"Super ""Pro"" Gadget"');

    // Formula injection neutralization (=, +, -, @)
    expect(escapeCsvField("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(escapeCsvField("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(escapeCsvField("-50")).toBe("'-50");
    expect(escapeCsvField("@import")).toBe("'@import");
  });

  it("generates correct Stellar Expert block explorer transaction links", () => {
    const txHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const explorerUrl = getStellarExplorerLink("tx", txHash);

    expect(explorerUrl).toBe(`https://stellar.expert/explorer/testnet/tx/${txHash}`);
    expect(explorerUrl.startsWith("https://stellar.expert/explorer/testnet/")).toBe(true);
  });

  it("verifies all claimed sales have valid transaction receipts and valid 56-character Stellar addresses", () => {
    const claimedSales = SALES_LEDGER.filter((s) => s.status === "claimed");

    claimedSales.forEach((sale: SaleRecord) => {
      expect(sale.txHash).toBeDefined();
      expect(sale.txHash?.length).toBe(64); // SHA-256 64-hex char
      expect(sale.campaignAddress).toHaveLength(56);
      expect(sale.affiliate).toHaveLength(56);
      expect(sale.memo).toContain(`StormSale-Commission-#${sale.id}`);
    });
  });

  it("validates 56-character Stellar G... and C... addresses and 64-hex transaction hashes", () => {
    // Valid account address (G...)
    expect(isValidStellarAddress("GADNSF7745EV3D5IRWBRN6OYXMR2YYAEGLDMULGTGDKKSBVXWMMVNPW6")).toBe(
      true,
    );
    // Valid contract ID (C...)
    expect(isValidStellarAddress("CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526")).toBe(
      true,
    );

    // Invalid truncated or placeholder addresses
    expect(isValidStellarAddress("CA7QW5KXGPTR4N2K9J2M7V4...")).toBe(false);
    expect(isValidStellarAddress("GBBD5678WXYZ...")).toBe(false);
    expect(isValidStellarAddress("")).toBe(false);
    expect(isValidStellarAddress(undefined as unknown as string)).toBe(false);
    expect(isValidStellarAddress("not-an-address")).toBe(false);

    // Valid tx hash (64 hex characters)
    expect(isValidTxHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe(
      true,
    );

    // Invalid tx hashes
    expect(isValidTxHash("tx_12345")).toBe(false);
    expect(isValidTxHash("")).toBe(false);
    expect(isValidTxHash(undefined)).toBe(false);
  });

  describe("Horizon settlements mapper & fetcher (#51)", () => {
    const userAddress = "GADNSF7745EV3D5IRWBRN6OYXMR2YYAEGLDMULGTGDKKSBVXWMMVNPW6";
    const escrowContract = CONTRACT_ADDRESSES.CAMPAIGN_ESCROW;
    const validHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    it("maps valid invoke_host_function native transfer from escrow to userAddress", () => {
      const records: HorizonPaymentRecord[] = [
        {
          id: "op-101",
          type: "invoke_host_function",
          created_at: "2026-10-15T12:00:00Z",
          transaction_hash: validHash,
          asset_balance_changes: [
            {
              type: "transfer",
              asset_type: "native",
              from: escrowContract,
              to: userAddress,
              amount: "150.5000000",
            },
          ],
        },
      ];

      const mapped = mapHorizonPaymentsToSales(records, userAddress);
      expect(mapped).toHaveLength(1);
      expect(mapped[0].id).toBe("op-101");
      expect(mapped[0].commissionAmount).toBe("150.5000000");
      expect(mapped[0].campaignAddress).toBe(escrowContract);
      expect(mapped[0].affiliate).toBe(userAddress);
      expect(mapped[0].status).toBe("claimed");
      expect(mapped[0].claimed).toBe(true);
      expect(mapped[0].txHash).toBe(validHash);
      expect(mapped[0].campaignId).toBeUndefined();
      expect(mapped[0].memo).toBeUndefined();
    });

    it("rejects classic payment records, non-native transfers, wrong recipients, and invalid addresses", () => {
      const records: HorizonPaymentRecord[] = [
        // Classic payment record -> reject
        {
          id: "op-classic",
          type: "payment",
          asset_type: "native",
          from: escrowContract,
          to: userAddress,
          amount: "50.0",
          created_at: "2026-10-15T12:00:00Z",
          transaction_hash: validHash,
        },
        // Non-native transfer -> reject
        {
          id: "op-usdc",
          type: "invoke_host_function",
          created_at: "2026-10-15T12:00:00Z",
          transaction_hash: validHash,
          asset_balance_changes: [
            {
              type: "transfer",
              asset_type: "credit_alphanum4",
              asset_code: "USDC",
              from: escrowContract,
              to: userAddress,
              amount: "25.0",
            },
          ],
        },
        // Wrong recipient -> reject
        {
          id: "op-wrong-recipient",
          type: "invoke_host_function",
          created_at: "2026-10-15T12:00:00Z",
          transaction_hash: validHash,
          asset_balance_changes: [
            {
              type: "transfer",
              asset_type: "native",
              from: escrowContract,
              to: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
              amount: "100.0",
            },
          ],
        },
        // Invalid address -> reject
        {
          id: "op-invalid-addr",
          type: "invoke_host_function",
          created_at: "2026-10-15T12:00:00Z",
          transaction_hash: validHash,
          asset_balance_changes: [
            {
              type: "transfer",
              asset_type: "native",
              from: "invalid_address",
              to: userAddress,
              amount: "75.0",
            },
          ],
        },
      ];

      const mapped = mapHorizonPaymentsToSales(records, userAddress);
      expect(mapped).toHaveLength(0);
    });

    it("produces undefined txHash for invalid transaction_hash values", () => {
      const records: HorizonPaymentRecord[] = [
        {
          id: "op-bad-hash",
          type: "invoke_host_function",
          created_at: "2026-10-15T12:00:00Z",
          transaction_hash: "invalid-hash",
          asset_balance_changes: [
            {
              type: "transfer",
              asset_type: "native",
              from: escrowContract,
              to: userAddress,
              amount: "80.0",
            },
          ],
        },
      ];

      const mapped = mapHorizonPaymentsToSales(records, userAddress);
      expect(mapped).toHaveLength(1);
      expect(mapped[0].txHash).toBeUndefined();
    });

    it("fetches settlements and throws Horizon HTTP ${status} for non-OK responses", async () => {
      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(fetchHorizonSettlements(userAddress)).rejects.toThrow("Horizon HTTP 500");
      spy.mockRestore();
    });

    it("fetches settlements and maps successful responses", async () => {
      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          _embedded: {
            records: [
              {
                id: "op-200",
                type: "invoke_host_function",
                created_at: "2026-10-15T14:00:00Z",
                transaction_hash: validHash,
                asset_balance_changes: [
                  {
                    type: "transfer",
                    asset_type: "native",
                    from: escrowContract,
                    to: userAddress,
                    amount: "200.0",
                  },
                ],
              },
            ],
          },
        }),
      } as Response);

      const result = await fetchHorizonSettlements(userAddress);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("op-200");
      expect(result[0].commissionAmount).toBe("200.0");
      spy.mockRestore();
    });
  });
});
