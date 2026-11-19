import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Badge, type BadgeVariant } from "../../src/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../../src/components/ui/card";
import { Input } from "../../src/components/ui/input";
import { Label } from "../../src/components/ui/label";
import { InputGroup, InputField } from "../../src/components/ui/input-group";
import { Skeleton } from "../../src/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "../../src/components/ui/table";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../src/components/ui/tabs";

describe("[Snapshot] UI Primitives Baseline Library (#90)", () => {
  describe("Badge Variants", () => {
    const badgeVariants: BadgeVariant[] = ["emerald", "amber", "rose", "indigo"];

    badgeVariants.forEach((variant) => {
      it(`matches snapshot for Badge variant: "${variant}"`, () => {
        const html = renderToString(<Badge variant={variant}>Badge {variant}</Badge>);
        expect(html).toMatchSnapshot();
      });
    });

    it("matches snapshot for Badge with custom class and tooltip", () => {
      const html = renderToString(
        <TooltipProvider>
          <Badge variant="indigo" tooltip="Verified by Soroban Contract" className="font-mono">
            Verified
          </Badge>
        </TooltipProvider>,
      );
      expect(html).toMatchSnapshot();
    });
  });

  describe("Card Component Hierarchy", () => {
    it("matches snapshot for standard Card with full header, body and footer", () => {
      const html = renderToString(
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Campaign Analytics</CardTitle>
            <CardDescription>Real-time on-chain performance data</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-600">Total Converted Sales: 420 XLM</p>
          </CardContent>
          <CardFooter className="justify-between">
            <span className="text-xs text-muted-foreground">Updated 1m ago</span>
            <span className="font-semibold text-emerald-600">+12.4%</span>
          </CardFooter>
        </Card>,
      );
      expect(html).toMatchSnapshot();
    });
  });

  describe("Form Input & Label Primitives", () => {
    it("matches snapshot for Input standard, placeholder, and disabled", () => {
      const standard = renderToString(<Input placeholder="Enter affiliate ID..." />);
      const disabled = renderToString(<Input disabled value="Locked Parameter" />);
      const numberInput = renderToString(<Input type="number" min="0" max="100" step="5" />);

      expect(standard).toMatchSnapshot();
      expect(disabled).toMatchSnapshot();
      expect(numberInput).toMatchSnapshot();
    });

    it("matches snapshot for Label with htmlFor and required state", () => {
      const html = renderToString(
        <Label htmlFor="campaign-budget" className="text-sm font-medium">
          Campaign Budget (XLM) *
        </Label>,
      );
      expect(html).toMatchSnapshot();
    });

    it("matches snapshot for InputGroup and InputField with description and error", () => {
      const html = renderToString(
        <InputGroup>
          <InputField
            label="Attribution Window"
            description="Days before commission attribution expires"
            required
          >
            <Input defaultValue="30" />
          </InputField>
          <InputField label="Custom Payout Cap" error="Payout cap must be greater than 0 XLM">
            <Input defaultValue="0" className="border-red-500" />
          </InputField>
        </InputGroup>,
      );
      expect(html).toMatchSnapshot();
    });
  });

  describe("Skeleton Loading States", () => {
    it("matches snapshot for default, zinc800, and customized Skeleton blocks", () => {
      const defaultSk = renderToString(<Skeleton className="h-4 w-48" />);
      const zincSk = renderToString(<Skeleton variant="zinc800" className="h-10 w-full" />);
      const avatarSk = renderToString(<Skeleton className="h-12 w-12 rounded-full" />);

      expect(defaultSk).toMatchSnapshot();
      expect(zincSk).toMatchSnapshot();
      expect(avatarSk).toMatchSnapshot();
    });
  });

  describe("Table Layout Primitives", () => {
    it("matches snapshot for Table with headers, rows, and cells", () => {
      const html = renderToString(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Affiliate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">GBZX...4ES2</TableCell>
              <TableCell>Confirmed</TableCell>
              <TableCell className="text-right">45.00 XLM</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">GA2C...VY7</TableCell>
              <TableCell>Pending</TableCell>
              <TableCell className="text-right">15.50 XLM</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
      expect(html).toMatchSnapshot();
    });
  });

  describe("Tabs Primitive Navigation", () => {
    it("matches snapshot for Tabs with default selected item", () => {
      const html = renderToString(
        <Tabs defaultValue="campaigns">
          <TabsList>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="payouts">Payouts</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
          <TabsContent value="campaigns">
            <div className="p-4">Active Campaigns List</div>
          </TabsContent>
          <TabsContent value="payouts">
            <div className="p-4">Escrow Claims & Payouts</div>
          </TabsContent>
        </Tabs>,
      );
      expect(html).toMatchSnapshot();
    });
  });
});
