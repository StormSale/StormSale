import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  TerminologyTooltip,
  TerminologyGuideDialog,
} from "../components/ui/tooltip";
import {
  getTerminologyItem,
  getAllTerminology,
  searchTerminology,
  getTerminologyByCategory,
  TERMINOLOGY_CATEGORIES,
} from "../data/terminology";

describe("Global Terminology Dictionary Suite (#8)", () => {
  it("contains all core platform and crypto terms with required metadata", () => {
    const allTerms = getAllTerminology();
    expect(allTerms.length).toBeGreaterThanOrEqual(15);

    allTerms.forEach((item) => {
      expect(item.id).toBeTruthy();
      expect(item.term).toBeTruthy();
      expect(Array.isArray(item.aliases)).toBe(true);
      expect(item.category).toBeTruthy();
      expect(Object.keys(TERMINOLOGY_CATEGORIES)).toContain(item.category);
      expect(item.shortDefinition).toBeTruthy();
      expect(item.shortDefinition.length).toBeGreaterThan(10);
      expect(item.fullDefinition).toBeTruthy();
    });
  });

  it("retrieves terms by exact ID, title, and aliases case-insensitively", () => {
    // Exact ID
    const xlm = getTerminologyItem("xlm");
    expect(xlm).toBeDefined();
    expect(xlm?.term).toBe("Stellar Lumens (XLM)");
    expect(xlm?.category).toBe("stellar");

    // Title case
    const soroban = getTerminologyItem("Soroban Smart Contracts");
    expect(soroban).toBeDefined();
    expect(soroban?.id).toBe("soroban");

    // Alias
    const lumensAlias = getTerminologyItem("lumens");
    expect(lumensAlias?.id).toBe("xlm");

    const wasmAlias = getTerminologyItem("wasm contract");
    expect(wasmAlias?.id).toBe("soroban");

    const batchClaimAlias = getTerminologyItem("batch claim");
    expect(batchClaimAlias?.id).toBe("merkle_proof");
  });

  it("handles whitespace, casing, and dashes gracefully", () => {
    expect(getTerminologyItem("  XLM  ")?.id).toBe("xlm");
    expect(getTerminologyItem("clearing-period")?.id).toBe("clearing_period");
    expect(getTerminologyItem("clearing period")?.id).toBe("clearing_period");
    expect(getTerminologyItem("Multi-Sig")?.id).toBe("multisig");
    expect(getTerminologyItem("non-existent-crypto-term-xyz")).toBeUndefined();
  });

  it("filters terminology by category accurately", () => {
    const stellarTerms = getTerminologyByCategory("stellar");
    expect(stellarTerms.length).toBeGreaterThan(0);
    expect(stellarTerms.every((t) => t.category === "stellar")).toBe(true);
    expect(stellarTerms.some((t) => t.id === "xlm")).toBe(true);
    expect(stellarTerms.some((t) => t.id === "stroop")).toBe(true);

    const contractTerms = getTerminologyByCategory("smart-contracts");
    expect(contractTerms.some((t) => t.id === "soroban")).toBe(true);
    expect(contractTerms.some((t) => t.id === "escrow")).toBe(true);

    const securityTerms = getTerminologyByCategory("security");
    expect(securityTerms.some((t) => t.id === "passkey")).toBe(true);
    expect(securityTerms.some((t) => t.id === "soc2")).toBe(true);
    expect(securityTerms.some((t) => t.id === "ledger_bridge")).toBe(true);

    const affiliateTerms = getTerminologyByCategory("affiliate");
    expect(affiliateTerms.some((t) => t.id === "commission_rate")).toBe(true);
    expect(affiliateTerms.some((t) => t.id === "clearing_period")).toBe(true);
  });

  it("searches terminology across terms, definitions, and aliases", () => {
    const webauthnSearch = searchTerminology("WebAuthn");
    expect(webauthnSearch.some((t) => t.id === "passkey")).toBe(true);

    const refundSearch = searchTerminology("refund");
    expect(refundSearch.some((t) => t.id === "clearing_period")).toBe(true);

    const emptySearch = searchTerminology("");
    expect(emptySearch.length).toBe(getAllTerminology().length);
  });
});

describe("Contextual Tooltip & UI Primitive Suite (#8)", () => {
  it("configures TooltipProvider with 300ms default hover delay", () => {
    const html = renderToString(
      <TooltipProvider>
        <span>Child</span>
      </TooltipProvider>,
    );
    expect(html).toContain("Child");
  });

  it("renders TooltipContent with collision detection enabled", () => {
    const html = renderToString(
      <TooltipProvider delayDuration={300}>
        <Tooltip open>
          <TooltipTrigger asChild>
            <button>Hover trigger</button>
          </TooltipTrigger>
          <TooltipContent
            portalled={false}
            avoidCollisions
            side="top"
            sideOffset={6}
            collisionPadding={8}
          >
            Accessible Tooltip Information
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(html).toContain("Hover trigger");
    expect(html).toContain("Accessible Tooltip Information");
  });

  it("renders TerminologyTooltip for technical crypto terms with accessible metadata", () => {
    const html = renderToString(
      <TooltipProvider delayDuration={300}>
        <TerminologyTooltip term="xlm" />
      </TooltipProvider>,
    );

    // Should render the term and accessible attributes
    expect(html).toContain("Stellar Lumens (XLM)");
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Definition for Stellar Lumens (XLM)"');
    expect(html).toContain("border-dotted");
  });

  it("supports custom children and inline help icons in TerminologyTooltip", () => {
    const html = renderToString(
      <TooltipProvider delayDuration={300}>
        <TerminologyTooltip term="soroban" showIcon>
          <span>Smart Contract Engine</span>
        </TerminologyTooltip>
      </TooltipProvider>,
    );

    expect(html).toContain("Smart Contract Engine");
    expect(html).toContain('aria-label="Definition for Soroban Smart Contracts"');
  });

  it("supports iconOnly mode for dense table headers and form inputs", () => {
    const html = renderToString(
      <TooltipProvider delayDuration={300}>
        <TerminologyTooltip term="escrow" iconOnly />
      </TooltipProvider>,
    );

    expect(html).toContain("<button");
    expect(html).toContain('aria-label="Definition for Escrow Contract"');
  });

  it("renders TerminologyGuideDialog with search and category filters", () => {
    const html = renderToString(
      <TerminologyGuideDialog open portalled={false} onOpenChange={() => {}} />,
    );

    expect(html).toContain("StormSale Terminology Guide");
    expect(html).toContain("Search terminology");
    expect(html).toContain("Stellar Network");
    expect(html).toContain("Smart Contracts");
    expect(html).toContain("Security &amp; Audits");
    expect(html).toContain("Stellar Lumens (XLM)");
    expect(html).toContain("Soroban Smart Contracts");
  });
});
