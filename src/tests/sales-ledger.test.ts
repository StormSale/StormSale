import { describe, it, expect } from "vitest";
import { getStellarExplorerLink } from "../utils/network";
import {
  filterAndSortSales,
  escapeCsvField,
  SALES_LEDGER,
  isValidStellarAddress,
  isValidTxHash,
  type SaleRecord,
} from "../components/affiliate/SalesList";

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
    expect(
      isValidStellarAddress("GADNSF7745EV3D5IRWBRN6OYXMR2YYAEGLDMULGTGDKKSBVXWMMVNPW6"),
    ).toBe(true);
    // Valid contract ID (C...)
    expect(
      isValidStellarAddress("CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526"),
    ).toBe(true);

    // Invalid truncated or placeholder addresses
    expect(isValidStellarAddress("CA7QW5KXGPTR4N2K9J2M7V4...")).toBe(false);
    expect(isValidStellarAddress("GBBD5678WXYZ...")).toBe(false);
    expect(isValidStellarAddress("")).toBe(false);
    expect(isValidStellarAddress(undefined)).toBe(false);
    expect(isValidStellarAddress("not-an-address")).toBe(false);

    // Valid tx hash (64 hex characters)
    expect(
      isValidTxHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
    ).toBe(true);

    // Invalid tx hashes
    expect(isValidTxHash("tx_12345")).toBe(false);
    expect(isValidTxHash("")).toBe(false);
    expect(isValidTxHash(undefined)).toBe(false);
  });
});
