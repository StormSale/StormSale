import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TerminologyTooltip,
  TerminologyGuide,
  TERMINOLOGY_DICTIONARY,
  getTermDefinition,
} from "../components/ui/tooltip";

describe("[UI] Contextual Tooltip & Terminology Guide Suite (#15)", () => {
  describe("Global Terminology Dictionary", () => {
    it("contains foundational Stellar and Soroban technical terms", () => {
      expect(TERMINOLOGY_DICTIONARY.XLM).toBeDefined();
      expect(TERMINOLOGY_DICTIONARY.SOROBAN).toBeDefined();
      expect(TERMINOLOGY_DICTIONARY["SEP-0010"]).toBeDefined();
      expect(TERMINOLOGY_DICTIONARY.ESCROW).toBeDefined();
      expect(TERMINOLOGY_DICTIONARY.FREIGHTER).toBeDefined();
      expect(TERMINOLOGY_DICTIONARY["MERKLE TREE"]).toBeDefined();
      expect(TERMINOLOGY_DICTIONARY["CLEARING PERIOD"]).toBeDefined();
    });

    it("includes required platform roles in the dictionary", () => {
      expect(TERMINOLOGY_DICTIONARY.ADVERTISER).toBeDefined();
      expect(TERMINOLOGY_DICTIONARY.AFFILIATE).toBeDefined();
      expect(TERMINOLOGY_DICTIONARY.AUDITOR).toBeDefined();
    });

    it("retrieves term definitions with case-insensitive normalization", () => {
      const xlmLower = getTermDefinition("xlm");
      expect(xlmLower).not.toBeNull();
      expect(xlmLower?.name).toContain("Stellar Lumens");

      const sorobanMixed = getTermDefinition("SoRoBan");
      expect(sorobanMixed?.category).toBe("Stellar / Protocol");

      const sep10 = getTermDefinition("sep-0010");
      expect(sep10?.category).toBe("Security / Cryptography");
    });

    it("returns null for non-existent or empty terms", () => {
      expect(getTermDefinition("")).toBeNull();
      expect(getTermDefinition("UNKNOWN_NONEXISTENT_CRYPTO_TERM_XYZ")).toBeNull();
    });
  });

  describe("Tooltip Primitives & Accessible Markup", () => {
    it("renders TooltipTrigger with accessible attributes and 300ms default delay", () => {
      const html = renderToString(
        <TooltipProvider delayDuration={300}>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button type="button">Hover me</button>
            </TooltipTrigger>
          </Tooltip>
        </TooltipProvider>,
      );

      expect(html).toContain("Hover me");
      expect(html).toContain('type="button"');
    });

    it("renders TerminologyTooltip trigger with accessible role and terminology guide label", () => {
      const html = renderToString(
        <TerminologyTooltip term="XLM" showIcon={true}>
          Native Stellar Currency
        </TerminologyTooltip>,
      );

      expect(html).toContain("Native Stellar Currency");
      expect(html).toContain('role="button"');
      expect(html).toContain('aria-label="Terminology guide for XLM"');
      expect(html).toContain("cursor-help");
      expect(html).toContain("border-dotted");
    });

    it("renders TerminologyGuide glossary listing with category badges", () => {
      const html = renderToString(<TerminologyGuide filterCategory="Security / Cryptography" />);

      expect(html).toContain("Platform Terminology Guide");
      expect(html).toContain("SEP-0010 Authentication");
      expect(html).toContain("Merkle Tree Batch Proof");
      expect(html).toContain("Security / Cryptography");
      expect(html).not.toContain("Stellar Lumens (XLM)");
    });

    it("filters TerminologyGuide correctly by search term", () => {
      const html = renderToString(<TerminologyGuide searchTerm="Escrow" />);

      expect(html).toContain("Smart Contract Escrow");
      expect(html).not.toContain("Freighter Wallet");
    });
  });
});
