import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import {
  CopyButton,
  CopyableAddress,
  CopyBadge,
  copyToClipboard,
} from "../components/ui/copy-button";

describe("[Branding & Copy Toolkit] CopyButton Suite (#10)", () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = (globalThis as any).document;

  const setNavigator = (value: any) => {
    Object.defineProperty(globalThis, "navigator", {
      value,
      configurable: true,
      writable: true,
    });
  };

  const setDocument = (value: any) => {
    Object.defineProperty(globalThis, "document", {
      value,
      configurable: true,
      writable: true,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setNavigator(originalNavigator);
    setDocument(originalDocument);
  });

  describe("copyToClipboard engine & fallback mechanism", () => {
    it("returns false if text is empty", async () => {
      const result = await copyToClipboard("");
      expect(result).toBe(false);
    });

    it("uses navigator.clipboard.writeText when available", async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      setNavigator({
        clipboard: {
          writeText: mockWriteText,
        },
      });

      const result = await copyToClipboard("GB6M4OEXAMPLESTELLARPUBLICKEY");
      expect(result).toBe(true);
      expect(mockWriteText).toHaveBeenCalledWith("GB6M4OEXAMPLESTELLARPUBLICKEY");
    });

    it("falls back to document.execCommand when navigator.clipboard throws", async () => {
      const mockWriteText = vi.fn().mockRejectedValue(new Error("Permission denied"));
      const mockExecCommand = vi.fn().mockReturnValue(true);

      const appendChildSpy = vi.fn();
      const removeChildSpy = vi.fn();

      setNavigator({
        clipboard: {
          writeText: mockWriteText,
        },
      });

      setDocument({
        createElement: vi.fn().mockReturnValue({
          style: {},
          setAttribute: vi.fn(),
          focus: vi.fn(),
          select: vi.fn(),
          setSelectionRange: vi.fn(),
        }),
        body: {
          appendChild: appendChildSpy,
          removeChild: removeChildSpy,
        },
        execCommand: mockExecCommand,
      });

      const result = await copyToClipboard("GB6M4OEXAMPLEFALLBACK");
      expect(result).toBe(true);
      expect(mockWriteText).toHaveBeenCalled();
      expect(mockExecCommand).toHaveBeenCalledWith("copy");
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
    });

    it("falls back to document.execCommand when navigator.clipboard is undefined", async () => {
      const mockExecCommand = vi.fn().mockReturnValue(true);

      setNavigator({});
      setDocument({
        createElement: vi.fn().mockReturnValue({
          style: {},
          setAttribute: vi.fn(),
          focus: vi.fn(),
          select: vi.fn(),
          setSelectionRange: vi.fn(),
        }),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
        execCommand: mockExecCommand,
      });

      const result = await copyToClipboard("GB6M4OFALLBACK2");
      expect(result).toBe(true);
      expect(mockExecCommand).toHaveBeenCalledWith("copy");
    });

    it("handles execCommand failure safely and returns false", async () => {
      setNavigator({});
      setDocument({
        createElement: vi.fn().mockImplementation(() => {
          throw new Error("DOM write error");
        }),
      });

      const result = await copyToClipboard("GB6M4OFAIL");
      expect(result).toBe(false);
    });
  });

  describe("CopyButton UI rendering", () => {
    it("renders CopyButton with custom label and accessible attributes", () => {
      const html = renderToString(
        <CopyButton
          text="GB6M4OEXAMPLESTELLARPUBLICKEY"
          label="Copy Public Key"
          copiedLabel="Copied Address!"
        />,
      );

      expect(html).toContain("Copy Public Key");
      expect(html).toContain('aria-label="Copy Public Key"');
      expect(html).toContain('title="Copy Public Key"');
      expect(html).toContain('type="button"');
    });

    it("renders CopyButton in icon-only mode when specified", () => {
      const html = renderToString(
        <CopyButton text="GB6M4OEXAMPLESTELLARPUBLICKEY" iconOnly={true} size="icon" />,
      );

      expect(html).toContain("h-8 w-8");
      expect(html).toContain('aria-label="Copy to clipboard"');
    });

    it("applies premium indigo styling variant when requested", () => {
      const html = renderToString(
        <CopyButton text="GB6M4OEXAMPLE" label="Copy URI" variant="indigo" />,
      );

      expect(html).toContain("bg-indigo-600");
      expect(html).toContain("text-white");
    });
  });

  describe("CopyableAddress & CopyBadge Components (#16)", () => {
    it("renders CopyableAddress with truncated Stellar address and role button", () => {
      const fullAddress = "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5";
      const html = renderToString(<CopyableAddress address={fullAddress} />);

      expect(html).toContain("GBBD47...FLA5");
      expect(html).toContain('role="button"');
      expect(html).toContain(`aria-label="Copy Stellar address ${fullAddress}"`);
      expect(html).toContain("cursor-pointer");
    });

    it("renders CopyableAddress without truncation when truncate is false", () => {
      const fullAddress = "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5";
      const html = renderToString(<CopyableAddress address={fullAddress} truncate={false} />);

      expect(html).toContain(fullAddress);
    });

    it("renders CopyBadge with hash icon and label", () => {
      const html = renderToString(<CopyBadge text="tx_123456789" label="tx_1234..." />);

      expect(html).toContain("tx_1234...");
      expect(html).toContain('role="button"');
      expect(html).toContain('aria-label="Copy tx_1234..."');
    });
  });
});
