import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../src/components/ui/table";

describe("Table visual baseline", () => {
  it("header and rows", () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            <TableHead>Payout</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Spring</TableCell>
            <TableCell>10</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
