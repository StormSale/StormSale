import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { DataTable, type ColumnDef } from "../components/ui/table";

interface TestSale {
  id: number;
  campaign: string;
  amount: number;
}

const mockSalesData: TestSale[] = [
  { id: 1, campaign: "Alpha Campaign", amount: 500 },
  { id: 2, campaign: "Beta Campaign", amount: 250 },
];

const testColumns: ColumnDef<TestSale>[] = [
  { id: "campaign", header: "Campaign", accessorKey: "campaign" },
  { id: "amount", header: "Amount", accessorKey: "amount" },
];

describe("DataTable error state and refresh behaviour", () => {
  describe("error banner", () => {
    it("renders the error message above the table", () => {
      const html = renderToString(
        <DataTable columns={testColumns} data={mockSalesData} error="Soroban RPC unreachable" />,
      );

      expect(html).toContain("Soroban RPC unreachable");
      expect(html).toContain('role="alert"');
    });

    it("does not render an error banner when no error is given", () => {
      const html = renderToString(<DataTable columns={testColumns} data={mockSalesData} />);

      expect(html).not.toContain('role="alert"');
    });

    it("keeps rendering the rows next to the error banner", () => {
      const html = renderToString(
        <DataTable columns={testColumns} data={mockSalesData} error="Soroban RPC unreachable" />,
      );

      expect(html).toContain("Alpha Campaign");
    });
  });

  describe("refresh behaviour", () => {
    it("replaces the rows with the skeleton by default", () => {
      const html = renderToString(
        <DataTable columns={testColumns} data={mockSalesData} isLoading={true} />,
      );

      expect(html).toContain("animate-pulse");
      expect(html).not.toContain("Alpha Campaign");
    });

    it("keeps the rows visible when preserveRowsOnRefresh is enabled", () => {
      const html = renderToString(
        <DataTable
          columns={testColumns}
          data={mockSalesData}
          isLoading={true}
          preserveRowsOnRefresh={true}
        />,
      );

      expect(html).toContain("Alpha Campaign");
      expect(html).toContain("Refreshing...");
      expect(html).toContain("opacity-60");
    });

    it("still shows the skeleton on the first load when preserveRowsOnRefresh is enabled", () => {
      const html = renderToString(
        <DataTable columns={testColumns} data={[]} isLoading={true} preserveRowsOnRefresh={true} />,
      );

      expect(html).toContain("animate-pulse");
      expect(html).not.toContain("Refreshing...");
    });
  });
});
