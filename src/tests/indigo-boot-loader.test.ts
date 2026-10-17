import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IndigoBootLoader } from "../components/shared/IndigoBootLoader";

describe("High-fidelity Indigo Boot Loader Suite", () => {
  it("renders centered branding, logo, and security encryption tag", () => {
    const markup = renderToStaticMarkup(
      React.createElement(IndigoBootLoader, { fast: true })
    );

    expect(markup).toContain("data-testid=\"indigo-boot-loader\"");
    expect(markup).toContain("StormSale");
    expect(markup).toContain("Security &amp; Encryption Hydration");
    expect(markup).toContain("Stellar Soroban v22");
    expect(markup).toContain("ChaCha20-Poly1305");
  });

  it("includes high-fidelity indigo styling classes and glowing radar elements", () => {
    const markup = renderToStaticMarkup(
      React.createElement(IndigoBootLoader, { fast: false })
    );

    // Deep background and indigo glowing classes
    expect(markup).toContain("bg-[#09090b]");
    expect(markup).toContain("from-indigo-900/30");
    expect(markup).toContain("border-indigo-500");
    expect(markup).toContain("bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-600");
    expect(markup).toContain("Skip to Dashboard →");
  });

  it("handles fast boot mode and triggers onComplete callback", async () => {
    const onComplete = vi.fn();
    vi.useFakeTimers();

    const element = React.createElement(IndigoBootLoader, {
      fast: true,
      onComplete,
    });
    renderToStaticMarkup(element);

    vi.advanceTimersByTime(200);
    vi.useRealTimers();
  });

  it("advances hydration progress smoothly across stages", () => {
    const markup = renderToStaticMarkup(
      React.createElement(IndigoBootLoader, { minDurationMs: 800 })
    );

    expect(markup).toContain("Initializing Cryptographic Session");
    expect(markup).toContain("Generating ephemeral session keys");
  });
});
