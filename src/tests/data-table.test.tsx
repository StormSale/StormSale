import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  DataTable,
  AddressCell,
  TxHashCell,
  TableSkeleton,
  type ColumnDef,
  type SortingState,
  type PaginationState,
} from "../components/ui/table";

interface TestSale {
  id: number;
  campaign: string;
  advertiser: string;
  txHash: string;
  amount: number;
  cleared: boolean;
}

const mockSalesData: TestSale[] = [
  {
    id: 1,
    campaign: "Alpha Campaign",
    advertiser: "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
    txHash: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
    amount: 500,
    cleared: true,
  },
  {
    id: 2,
    campaign: "Beta Campaign",
    advertiser: "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
    txHash: "b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef01",
    amount: 1200,
    cleared: false,
  },
  {
    id: 3,
    campaign: "Gamma Campaign",
    advertiser: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    txHash: "c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef012",
    amount: 150,
    cleared: true,
  },
  {
    id: 4,
    campaign: "Alpha Campaign",
    advertiser: "GCIXQZ26A32F7LKM6P2VFXRMY6F7ZQQWXZKJ6RFLN6G43L6W47UFXZYA",
    txHash: "d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0123",
    amount: 850,
    cleared: false,
  },
  {
    id: 5,
    campaign: "Delta Campaign",
    advertiser: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    txHash: "e5f67890123456789abcdef0123456789abcdef0123456789abcdef01234",
    amount: 300,
    cleared: true,
  },
];

const testColumns: ColumnDef<TestSale>[] = [
  {
    accessorKey: "id",
    header: "Sale ID",
    cell: ({ value }) => `#${String(value)}`,
    enableSorting: true,
  },
  {
    accessorKey: "campaign",
    header: "Campaign Name",
    enableSorting: true,
  },
  {
    accessorKey: "advertiser",
    header: "Advertiser Address",
    cell: ({ value }) => <AddressCell address={String(value)} truncateChars={4} />,
    enableSorting: false,
  },
  {
    accessorKey: "txHash",
    header: "Transaction Hash",
    cell: ({ value }) => <TxHashCell hash={String(value)} truncateChars={6} />,
    enableSorting: false,
  },
  {
    accessorKey: "amount",
    header: "Amount (XLM)",
    cell: ({ value }) => `${Number(value).toFixed(2)} XLM`,
    enableSorting: true,
  },
  {
    accessorKey: "cleared",
    header: "Status",
    cell: ({ value }) => (value ? "Cleared" : "Pending"),
    enableSorting: true,
  },
];

describe("DataTable Component Suite (#6)", () => {
  describe("Rendering & Baseline Behavior", () => {
    it("renders table headers and data rows correctly", () => {
      const html = renderToString(<DataTable columns={testColumns} data={mockSalesData} />);

      expect(html).toContain("Sale ID");
      expect(html).toContain("Campaign Name");
      expect(html).toContain("Advertiser Address");
      expect(html).toContain("Transaction Hash");
      expect(html).toContain("Amount (XLM)");

      expect(html).toContain("Alpha Campaign");
      expect(html).toContain("Beta Campaign");
      expect(html).toContain("500.00 XLM");
      expect(html).toContain("1200.00 XLM");
    });

    it("displays custom emptyMessage when data is empty and not loading", () => {
      const html = renderToString(
        <DataTable
          columns={testColumns}
          data={[]}
          emptyMessage="No sales recorded for this period."
        />,
      );

      expect(html).toContain("No sales recorded for this period.");
    });

    it("supports getRowId prop for custom stable row keys and keyboard accessible rows", () => {
      const onRowClick = vi.fn();
      const html = renderToString(
        <DataTable
          columns={testColumns}
          data={mockSalesData}
          getRowId={(row) => `sale-item-${row.id}`}
          onRowClick={onRowClick}
        />,
      );

      // Clickable rows should have tabIndex=0, cursor-pointer, and visible focus styles
      expect(html).toContain('tabindex="0"');
      expect(html).toContain("cursor-pointer");
      expect(html).toContain("focus-visible:ring-indigo-500");
    });

    it("renders non-clickable rows without tabIndex or cursor-pointer", () => {
      const html = renderToString(<DataTable columns={testColumns} data={mockSalesData} />);

      // Rows without onRowClick should NOT have tabindex="0"
      expect(html).not.toMatch(/<tr[^>]*\btabindex="0"/);
      expect(html).not.toContain("cursor-pointer");
    });
  });

  describe("Multi-Column Sorting & Visual Indicators", () => {
    it("renders sortable headers with aria-sort and sort direction indicators", () => {
      const sorting: SortingState = [{ id: "campaign", desc: false, priority: 1 }];

      const html = renderToString(
        <DataTable columns={testColumns} data={mockSalesData} sorting={sorting} />,
      );

      // campaign header should have aria-sort="ascending"
      expect(html).toContain('aria-sort="ascending"');
      // non-sorted sortable column should have aria-sort="none"
      expect(html).toContain('aria-sort="none"');
    });

    it("displays multi-column sort priority badges with specific badge styling", () => {
      const multiSort: SortingState = [
        { id: "campaign", desc: false, priority: 1 },
        { id: "amount", desc: true, priority: 2 },
      ];

      const html = renderToString(
        <DataTable columns={testColumns} data={mockSalesData} sorting={multiSort} />,
      );

      // Both columns should reflect their sort direction
      expect(html).toContain('aria-sort="ascending"');
      expect(html).toContain('aria-sort="descending"');

      // Verify both priority badges are specifically rendered with bg-indigo-100 class
      expect(html).toMatch(/<span[^>]*bg-indigo-100[^>]*>\s*1\s*<\/span>/);
      expect(html).toMatch(/<span[^>]*bg-indigo-100[^>]*>\s*2\s*<\/span>/);
    });

    it("sorts rows client-side in primary and secondary order", () => {
      const multiSort: SortingState = [
        { id: "campaign", desc: false, priority: 1 },
        { id: "amount", desc: true, priority: 2 },
      ];

      const html = renderToString(
        <DataTable
          columns={testColumns}
          data={mockSalesData}
          sorting={multiSort}
          enablePagination={false}
        />,
      );

      // For "Alpha Campaign", amount 850 should precede amount 500 because amount is descending
      const pos850 = html.indexOf("850.00 XLM");
      const pos500 = html.indexOf("500.00 XLM");
      expect(pos850).toBeGreaterThan(-1);
      expect(pos500).toBeGreaterThan(-1);
      expect(pos850).toBeLessThan(pos500);
    });

    it("supports custom sortingFn per column definition", () => {
      const customCol: ColumnDef<TestSale>[] = [
        {
          accessorKey: "campaign",
          header: "Campaign",
          enableSorting: true,
          sortingFn: (a, b) => b.campaign.localeCompare(a.campaign), // Reverse order
        },
      ];

      const html = renderToString(
        <DataTable
          columns={customCol}
          data={mockSalesData}
          sorting={[{ id: "campaign", desc: false }]}
          enablePagination={false}
        />,
      );

      const posGamma = html.indexOf("Gamma Campaign");
      const posAlpha = html.indexOf("Alpha Campaign");
      expect(posGamma).toBeLessThan(posAlpha);
    });

    it("uses getColumnId consistently for computed columns without explicit id", () => {
      const computedCol: ColumnDef<TestSale>[] = [
        {
          header: "Computed Header",
          cell: ({ row }) => `Computed-${row.id}`,
          enableSorting: true,
          sortingFn: (a, b) => a.id - b.id,
        },
      ];

      const html = renderToString(
        <DataTable
          columns={computedCol}
          data={mockSalesData}
          sorting={[{ id: "col-0", desc: false }]}
          enablePagination={false}
        />,
      );

      expect(html).toContain("Computed-1");
      const firstRowIdx = html.indexOf("Computed-1");
      const secondRowIdx = html.indexOf("Computed-2");
      expect(firstRowIdx).toBeLessThan(secondRowIdx);
    });
  });

  describe("Client-side Search & Filtering", () => {
    it("filters table rows based on searchQuery across searchable columns", () => {
      const html = renderToString(
        <DataTable
          columns={testColumns}
          data={mockSalesData}
          searchQuery="Gamma"
          enablePagination={false}
        />,
      );

      expect(html).toContain("Gamma Campaign");
      expect(html).not.toContain("Alpha Campaign");
      expect(html).not.toContain("Beta Campaign");
      expect(html).not.toContain("Delta Campaign");
    });

    it("supports custom filterFn for specialized multi-field predicate", () => {
      const customFilter = (row: TestSale, _q: string) => row.cleared && row.amount > 200;

      const html = renderToString(
        <DataTable
          columns={testColumns}
          data={mockSalesData}
          searchQuery="any"
          filterFn={customFilter}
          enablePagination={false}
        />,
      );

      // Cleared > 200: id 1 (500), id 5 (300). NOT id 3 (150, cleared but < 200) or id 2 (1200, not cleared)
      expect(html).toContain("500.00 XLM");
      expect(html).toContain("300.00 XLM");
      expect(html).not.toContain("150.00 XLM");
      expect(html).not.toContain("1200.00 XLM");
    });
  });

  describe("Client-side & Server-side Pagination", () => {
    it("slices data client-side according to pageSize and pageIndex with exact footer text", () => {
      const pagination: PaginationState = { pageIndex: 0, pageSize: 2 };

      const html = renderToString(
        <DataTable
          columns={testColumns}
          data={mockSalesData}
          pagination={pagination}
          pageSizeOptions={[2, 5, 10]}
        />,
      );

      // Assert against complete footer range and total
      expect(html).toMatch(
        /Showing.*?<strong[^>]*>1<\/strong>.*?to.*?<strong[^>]*>2<\/strong>.*?of.*?<strong[^>]*>5<\/strong>.*?entries/,
      );
      expect(html).toContain("Page 1 of 3");

      // First 2 campaigns rendered
      expect(html).toContain("Alpha Campaign");
      expect(html).toContain("Beta Campaign");
      // Gamma Campaign (index 2) should NOT be on page 1
      expect(html).not.toContain("Gamma Campaign");
    });

    it("clamps client-side pageIndex when out of upper or lower bounds", () => {
      // Out of bounds upper index (pageIndex: 99 on 5 items with pageSize: 2 => max pageIndex is 2)
      const outOfBoundsUpper: PaginationState = { pageIndex: 99, pageSize: 2 };

      const htmlUpper = renderToString(
        <DataTable columns={testColumns} data={mockSalesData} pagination={outOfBoundsUpper} />,
      );

      // Clamps to page 3 of 3 (item 5 to 5 of 5)
      expect(htmlUpper).toMatch(
        /Showing.*?<strong[^>]*>5<\/strong>.*?to.*?<strong[^>]*>5<\/strong>.*?of.*?<strong[^>]*>5<\/strong>.*?entries/,
      );
      expect(htmlUpper).toContain("Page 3 of 3");
      expect(htmlUpper).toContain("Delta Campaign");

      // Out of bounds negative index
      const outOfBoundsLower: PaginationState = { pageIndex: -5, pageSize: 2 };
      const htmlLower = renderToString(
        <DataTable columns={testColumns} data={mockSalesData} pagination={outOfBoundsLower} />,
      );
      expect(htmlLower).toContain("Page 1 of 3");
    });

    it("handles server-side pagination with controlled totalRows and pageCount", () => {
      const serverPagination: PaginationState = { pageIndex: 2, pageSize: 10 };

      const html = renderToString(
        <DataTable
          columns={testColumns}
          data={mockSalesData}
          manualPagination
          totalRows={100}
          pageCount={10}
          pagination={serverPagination}
        />,
      );

      // Assert against complete footer range and total
      expect(html).toMatch(
        /Showing.*?<strong[^>]*>21<\/strong>.*?to.*?<strong[^>]*>30<\/strong>.*?of.*?<strong[^>]*>100<\/strong>.*?entries/,
      );
      expect(html).toContain("Page 3 of 10");
    });
  });

  describe("Custom Cell Renderers (Addresses & Transaction Hashes)", () => {
    it("AddressCell truncates Stellar account addresses and provides copy/explorer links", () => {
      const stellarAccount = "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37";
      const html = renderToString(
        <AddressCell address={stellarAccount} truncateChars={4} network="testnet" />,
      );

      expect(html).toContain("GDQP...4W37");
      expect(html).toContain('title="GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37"');
      expect(html).toContain('aria-label="Copy address"');
      expect(html).toContain(
        'href="https://stellar.expert/explorer/testnet/account/GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37"',
      );
      expect(html).toContain('target="_blank"');
    });

    it("AddressCell validates contracts and automatically links valid Soroban contracts", () => {
      // Valid contract StrKey ID
      const validContract = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";
      const html = renderToString(
        <AddressCell address={validContract} truncateChars={4} network="testnet" />,
      );

      expect(html).toContain("CAAQ...C526");
      expect(html).toContain(
        'href="https://stellar.expert/explorer/testnet/contract/CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526"',
      );
    });

    it("AddressCell renders NO explorer link for invalid or muxed addresses", () => {
      // Muxed address starting with M
      const muxedAddress = "MBVPFCM4IRHZ7MD576ID4X6Z7JHDAISVCG6AZR7T5ZS354RER47CSAAAAAAAAABQHGXKW";
      const htmlMuxed = renderToString(<AddressCell address={muxedAddress} truncateChars={4} />);

      // Must display truncated text but NO explorer link
      expect(htmlMuxed).toContain("MBVP...GXKW");
      expect(htmlMuxed).not.toContain("stellar.expert");
      expect(htmlMuxed).not.toContain("<a");

      // Completely invalid address
      const htmlInvalid = renderToString(
        <AddressCell address="invalid-address-not-strkey" truncateChars={4} />,
      );
      expect(htmlInvalid).not.toContain("<a");
    });

    it("AddressCell encodes address parameter and leaves custom explorerBaseUrl unchanged", () => {
      const account = "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37";
      const customBase = "https://custom.stellar.org/accounts";
      const html = renderToString(<AddressCell address={account} explorerBaseUrl={customBase} />);

      expect(html).toContain(`href="${customBase}/${account}"`);
    });

    it("TxHashCell truncates hashes, encodes hash path, and provides copy and explorer links", () => {
      const txHash = "e36e1e4985514dbdb96f3c22e4904a204a6462f59876543210abcdef12345678";
      const html = renderToString(<TxHashCell hash={txHash} truncateChars={6} network="testnet" />);

      expect(html).toContain("e36e1e...5678");
      expect(html).toContain(
        'title="e36e1e4985514dbdb96f3c22e4904a204a6462f59876543210abcdef12345678"',
      );
      expect(html).toContain('aria-label="Copy transaction hash"');
      expect(html).toContain(
        'href="https://stellar.expert/explorer/testnet/tx/e36e1e4985514dbdb96f3c22e4904a204a6462f59876543210abcdef12345678"',
      );
    });

    it("handles null or empty address/hash gracefully", () => {
      const emptyAddrHtml = renderToString(<AddressCell address="" />);
      expect(emptyAddrHtml).toContain("—");

      const emptyHashHtml = renderToString(<TxHashCell hash="" />);
      expect(emptyHashHtml).toContain("—");
    });
  });

  describe("Integration with Skeleton Loaders for Async States", () => {
    it("renders animated skeleton rows when isLoading is true", () => {
      const html = renderToString(
        <DataTable
          columns={testColumns}
          data={mockSalesData}
          isLoading={true}
          skeletonRowCount={4}
        />,
      );

      // Table should be marked as aria-busy
      expect(html).toContain('aria-busy="true"');
      // Should render animate-pulse skeleton placeholders
      expect(html).toContain("animate-pulse");
      // Data rows should NOT be rendered while loading
      expect(html).not.toContain("Alpha Campaign");
    });

    it("TableSkeleton component can be rendered standalone", () => {
      const html = renderToString(
        <table>
          <tbody>
            <TableSkeleton columns={testColumns} rowCount={3} />
          </tbody>
        </table>,
      );

      expect(html).toContain("animate-pulse");
      // 3 rows rendered
      const rowMatches = html.match(/<tr/g);
      expect(rowMatches?.length).toBe(3);
    });
  });
});
