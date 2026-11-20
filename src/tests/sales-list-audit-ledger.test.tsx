import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SalesList, type Sale } from "../components/affiliate/SalesList";

const mockSalesData: Sale[] = [
  {
    id: 101,
    affiliate: "GBBD111122223333444455556666777788889999AAAABBBBCCCC5678",
    saleAmount: "150.0",
    commissionAmount: "15.0",
    timestamp: Math.floor(Date.now() / 1000) - 86400, // In clearing
    clearingPeriod: 604800,
    claimed: false,
  },
  {
    id: 102,
    affiliate: "GBBD111122223333444455556666777788889999AAAABBBBCCCC5678",
    saleAmount: "300.0",
    commissionAmount: "30.0",
    timestamp: Math.floor(Date.now() / 1000) - 900000, // Settled
    clearingPeriod: 604800,
    claimed: true,
    txHash: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
  },
  {
    id: 103,
    affiliate: "GBBD111122223333444455556666777788889999AAAABBBBCCCC5678",
    saleAmount: "500.0",
    commissionAmount: "50.0",
    timestamp: Math.floor(Date.now() / 1000) - 700000, // Ready to claim (unlocked, unclaimed)
    clearingPeriod: 604800,
    claimed: false,
  },
];

describe("[Affiliate] Auditable Payout & History Ledger Suite (#51)", () => {
  it("renders searchable and filterable sales table with receipt links", () => {
    render(<SalesList sales={mockSalesData} />);

    // Verify search input and filter buttons are present
    expect(screen.getByTestId("search-sales-input")).toBeTruthy();
    expect(screen.getByTestId("filter-all")).toBeTruthy();
    expect(screen.getByTestId("filter-claimed")).toBeTruthy();
    expect(screen.getByTestId("filter-unlocked")).toBeTruthy();
    expect(screen.getByTestId("filter-clearing")).toBeTruthy();

    // Verify all rows render initially
    expect(screen.getByText("#101")).toBeTruthy();
    expect(screen.getByText("#102")).toBeTruthy();
    expect(screen.getByText("#103")).toBeTruthy();

    // Verify receipt link exists for claimed sale #102
    const receiptLink = screen.getByTestId("receipt-link-102");
    expect(receiptLink).toBeTruthy();
    expect(receiptLink.getAttribute("target")).toBe("_blank");
    expect(receiptLink.getAttribute("rel")).toBe("noopener noreferrer");
    expect(receiptLink.getAttribute("href")).toContain(
      "https://stellar.expert/explorer/testnet/tx/7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
    );

    // Unclaimed sales show Pending
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

  it("filters sales by status correctly", () => {
    render(<SalesList sales={mockSalesData} />);

    // Filter by Settled Claims
    fireEvent.click(screen.getByTestId("filter-claimed"));
    expect(screen.getByText("#102")).toBeTruthy();
    expect(screen.queryByText("#101")).toBeNull();
    expect(screen.queryByText("#103")).toBeNull();

    // Filter by Ready to Claim (unlocked)
    fireEvent.click(screen.getByTestId("filter-unlocked"));
    expect(screen.getByText("#103")).toBeTruthy();
    expect(screen.queryByText("#101")).toBeNull();
    expect(screen.queryByText("#102")).toBeNull();

    // Filter by In Clearing
    fireEvent.click(screen.getByTestId("filter-clearing"));
    expect(screen.getByText("#101")).toBeTruthy();
    expect(screen.queryByText("#102")).toBeNull();
    expect(screen.queryByText("#103")).toBeNull();

    // Reset to All
    fireEvent.click(screen.getByTestId("filter-all"));
    expect(screen.getByText("#101")).toBeTruthy();
    expect(screen.getByText("#102")).toBeTruthy();
    expect(screen.getByText("#103")).toBeTruthy();
  });

  it("searches sales by ID, amount, and transaction hash", () => {
    render(<SalesList sales={mockSalesData} />);

    const searchInput = screen.getByTestId("search-sales-input");

    // Search by sale ID
    fireEvent.change(searchInput, { target: { value: "101" } });
    expect(screen.getByText("#101")).toBeTruthy();
    expect(screen.queryByText("#102")).toBeNull();

    // Search by amount
    fireEvent.change(searchInput, { target: { value: "300.0" } });
    expect(screen.getByText("#102")).toBeTruthy();
    expect(screen.queryByText("#101")).toBeNull();

    // Search by txHash fragment
    fireEvent.change(searchInput, { target: { value: "7a8b9c0d" } });
    expect(screen.getByText("#102")).toBeTruthy();
    expect(screen.queryByText("#101")).toBeNull();
  });

  it("displays empty state when no sales match search and allows clearing filters", () => {
    render(<SalesList sales={mockSalesData} />);

    const searchInput = screen.getByTestId("search-sales-input");
    fireEvent.change(searchInput, { target: { value: "nonexistent-query-999" } });

    expect(screen.getByTestId("sales-empty-state")).toBeTruthy();
    expect(screen.getByText("No sales found")).toBeTruthy();

    const clearBtn = screen.getByText("Clear Filters");
    fireEvent.click(clearBtn);

    // All sales restored
    expect(screen.getByText("#101")).toBeTruthy();
    expect(screen.getByText("#102")).toBeTruthy();
    expect(screen.getByText("#103")).toBeTruthy();
  });

  it("exposes aria-pressed programmatic state on all status filter buttons", () => {
    render(<SalesList sales={mockSalesData} />);

    const filterAll = screen.getByTestId("filter-all");
    const filterClaimed = screen.getByTestId("filter-claimed");
    const filterUnlocked = screen.getByTestId("filter-unlocked");
    const filterClearing = screen.getByTestId("filter-clearing");

    // Initially 'all' is selected
    expect(filterAll.getAttribute("aria-pressed")).toBe("true");
    expect(filterClaimed.getAttribute("aria-pressed")).toBe("false");
    expect(filterUnlocked.getAttribute("aria-pressed")).toBe("false");
    expect(filterClearing.getAttribute("aria-pressed")).toBe("false");

    // Click 'claimed'
    fireEvent.click(filterClaimed);
    expect(filterAll.getAttribute("aria-pressed")).toBe("false");
    expect(filterClaimed.getAttribute("aria-pressed")).toBe("true");
    expect(filterUnlocked.getAttribute("aria-pressed")).toBe("false");
    expect(filterClearing.getAttribute("aria-pressed")).toBe("false");

    // Click 'unlocked'
    fireEvent.click(filterUnlocked);
    expect(filterUnlocked.getAttribute("aria-pressed")).toBe("true");
    expect(filterClaimed.getAttribute("aria-pressed")).toBe("false");

    // Click 'clearing'
    fireEvent.click(filterClearing);
    expect(filterClearing.getAttribute("aria-pressed")).toBe("true");
    expect(filterUnlocked.getAttribute("aria-pressed")).toBe("false");
  });

  it("preserves empty state when initialized without sales in production mode", () => {
    render(<SalesList />);
    expect(screen.getByTestId("sales-empty-state")).toBeTruthy();
    expect(screen.getByText("No sales found")).toBeTruthy();
  });
});
