// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IndigoBootLoader } from "../App";

describe("IndigoBootLoader Component (#76)", () => {
  it("renders centered branding, logo, and accessible loading status", () => {
    render(<IndigoBootLoader />);

    const loader = screen.getByRole("status", { name: "Booting StormSale" });
    expect(loader).toBeTruthy();
    expect(screen.getByText("StormSale")).toBeTruthy();
    expect(
      screen.getByText("Decentralized Escrow & Affiliate Protocol")
    ).toBeTruthy();
    expect(screen.getByText("Hydrating protocol...")).toBeTruthy();
    expect(screen.getByAltText("StormSale Logo")).toBeTruthy();
  });

  it("applies opacity-100 when active and opacity-0 when exiting", () => {
    const { rerender } = render(<IndigoBootLoader isExiting={false} />);
    const activeLoader = screen.getByRole("status", { name: "Booting StormSale" });
    expect(activeLoader.className).toContain("opacity-100");
    expect(activeLoader.className).not.toContain("opacity-0");

    rerender(<IndigoBootLoader isExiting={true} />);
    const exitingLoader = screen.getByRole("status", { name: "Booting StormSale" });
    expect(exitingLoader.className).toContain("opacity-0");
    expect(exitingLoader.className).toContain("pointer-events-none");
  });

  it("triggers onExited callback on transition completion", () => {
    const handleExited = vi.fn();
    render(<IndigoBootLoader isExiting={true} onExited={handleExited} />);

    const loader = screen.getByRole("status", { name: "Booting StormSale" });
    fireEvent.transitionEnd(loader);
    expect(handleExited).toHaveBeenCalled();
  });
});
