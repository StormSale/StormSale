// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  executeGraphQLQuery,
  goldskyIndexedStore,
  CAMPAIGN_HISTORY_QUERY,
  AFFILIATE_EARNINGS_QUERY,
  sorobanEventIndexerPipeline,
  type IndexerCampaign,
  type IndexerSale,
} from "../lib/indexer/goldskyIndexer";
import { useIndexerQuery } from "../hooks/useIndexerQuery";

describe("[Integration] Subgraph / Goldsky Indexer Integration (#202)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GraphQL Schema Completeness", () => {
    it("provides valid schema.graphql defining Campaigns, Sales, Claims, and Users", () => {
      const schemaPath = resolve(__dirname, "../../subgraph/schema.graphql");
      expect(existsSync(schemaPath)).toBe(true);

      const schemaContent = readFileSync(schemaPath, "utf-8");
      expect(schemaContent).toContain("type Campaign @entity");
      expect(schemaContent).toContain("type Sale @entity");
      expect(schemaContent).toContain("type Claim @entity");
      expect(schemaContent).toContain("type User @entity");
      expect(schemaContent).toContain("type Query");
    });
  });

  describe("High-Performance Query Latency (< 100ms)", () => {
    it("returns complete campaign history with sales and claims in < 100ms", async () => {
      const startTime = performance.now();
      const result = await executeGraphQLQuery<{ campaigns: IndexerCampaign[] }>(
        CAMPAIGN_HISTORY_QUERY,
      );
      const executionTime = performance.now() - startTime;

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data.campaigns)).toBe(true);
      expect(result.data.campaigns.length).toBeGreaterThan(0);
      expect(result.source).toBe("indexer");
      expect(result.isFallback).toBe(false);

      // Issue #202 Acceptance Criterion: Query returns complete campaign history in < 100ms
      expect(result.latencyMs).toBeLessThan(100);
      expect(executionTime).toBeLessThan(100);
    });

    it("returns affiliate earnings breakdown in < 100ms", async () => {
      const result = await executeGraphQLQuery<{
        affiliateEarnings: { affiliate: string; totalEarnedXlm: number };
      }>(AFFILIATE_EARNINGS_QUERY, {
        affiliate: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
      });

      expect(result.data.affiliateEarnings).toBeDefined();
      expect(result.data.affiliateEarnings.affiliate).toBe(
        "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
      );
      expect(result.latencyMs).toBeLessThan(100);
    });
  });

  describe("Direct Soroban RPC Fallback", () => {
    it("falls back gracefully to direct Soroban RPC if indexer is unavailable", async () => {
      const result = await executeGraphQLQuery<{ campaigns: IndexerCampaign[] }>(
        CAMPAIGN_HISTORY_QUERY,
        {},
        { forceRpcFallback: true },
      );

      expect(result.isFallback).toBe(true);
      expect(result.source).toBe("rpc_fallback");
      expect(result.data.campaigns).toBeDefined();
      expect(result.data.campaigns.length).toBeGreaterThan(0);
    });

    it("falls back to RPC when network fetch throws", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await executeGraphQLQuery<{ campaigns: IndexerCampaign[] }>(
        CAMPAIGN_HISTORY_QUERY,
        {},
        { endpoint: "https://invalid-goldsky-endpoint-subgraph.org/graphql" },
      );

      expect(result.source).toBe("rpc_fallback");
      expect(result.isFallback).toBe(true);
      expect(result.data.campaigns).toBeDefined();

      consoleSpy.mockRestore();
    });
  });

  describe("Indexed Store Mutation & Event Ingestion", () => {
    it("ingests new campaign event and updates indexer state", () => {
      const newCampaign: IndexerCampaign = {
        id: "202",
        name: "Winter Soroban Festival",
        advertiserAddress: "GA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D",
        budget: 10000,
        dailyPayoutCap: 2000,
        commissionRate: 15,
        clearingPeriodSecs: 86400,
        asset: "XLM",
        status: "ACTIVE",
        totalSalesCount: 0,
        totalVolumeXlm: 0,
        totalPaidOutXlm: 0,
        remainingEscrowBalance: 10000,
        createdAt: Date.now(),
        sales: [],
        claims: [],
      };

      goldskyIndexedStore.upsertCampaign(newCampaign);
      const retrieved = goldskyIndexedStore.getCampaign("202");
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("Winter Soroban Festival");
      expect(retrieved?.budget).toBe(10000);
    });

    it("ingests new sale event and associates with parent campaign", () => {
      const newSale: IndexerSale = {
        id: "sale_202_1",
        campaignId: "202",
        affiliateAddress: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
        amountXlm: 500,
        commissionEarnedXlm: 75,
        buyerHash: "buyer_test_hash",
        status: "CONFIRMED",
        timestamp: Date.now(),
        txHash: "0xabc123",
      };

      goldskyIndexedStore.upsertSale(newSale);
      const retrieved = goldskyIndexedStore.getCampaign("202");
      expect(retrieved?.sales.length).toBe(1);
      expect(retrieved?.sales[0].id).toBe("sale_202_1");
      expect(retrieved?.totalVolumeXlm).toBe(500);
    });
  });

  describe("useIndexerQuery React Hook", () => {
    it("fetches data on mount with loading and latency reporting", async () => {
      const { result } = renderHook(() =>
        useIndexerQuery<{ campaigns: IndexerCampaign[] }>(CAMPAIGN_HISTORY_QUERY),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.campaigns).toBeDefined();
      expect(result.current.error).toBeNull();
      expect(result.current.source).toBe("indexer");
      expect(result.current.isFallback).toBe(false);
    });

    it("refetches when refetch is called", async () => {
      const { result } = renderHook(() =>
        useIndexerQuery<{ campaigns: IndexerCampaign[] }>(CAMPAIGN_HISTORY_QUERY),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.data?.campaigns).toBeDefined();
      expect(result.current.loading).toBe(false);
    });
  });

  describe("SorobanEventIndexerPipeline Event Listening & Streaming", () => {
    it("ingests Soroban contract events into the indexed store and notifies listeners", async () => {
      const receivedEvents: any[] = [];
      const unsubscribe = sorobanEventIndexerPipeline.subscribe((ev) => {
        receivedEvents.push(ev);
      });

      await sorobanEventIndexerPipeline.ingestEvent({
        id: "evt_301",
        type: "campaign_created",
        contractId: "C12345",
        ledger: 10500,
        timestamp: Date.now(),
        txHash: "0xhash301",
        payload: {
          id: "301",
          name: "Pipeline Stream Campaign",
          budget: 5000,
          commissionRate: 12,
        },
      });

      unsubscribe();

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].id).toBe("evt_301");

      const campaign = goldskyIndexedStore.getCampaign("301");
      expect(campaign).toBeDefined();
      expect(campaign?.name).toBe("Pipeline Stream Campaign");

      const status = sorobanEventIndexerPipeline.getStatus();
      expect(status.lastIndexedLedger).toBe(10500);
    });

    it("handles startListening and stopListening lifecycle cleanly", () => {
      sorobanEventIndexerPipeline.startListening("https://soroban-testnet.stellar.org", "C12345");
      expect(sorobanEventIndexerPipeline.getStatus().isListening).toBe(true);

      sorobanEventIndexerPipeline.stopListening();
      expect(sorobanEventIndexerPipeline.getStatus().isListening).toBe(false);
    });
  });
});
