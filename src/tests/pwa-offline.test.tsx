// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { InstallPwaBanner } from "../components/shared/InstallPwaBanner";

describe("Progressive Web App (PWA) Offline Shell & Install System (#205)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks online and offline status reactively", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });

  it("captures beforeinstallprompt event and triggers prompt on user request", async () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isInstallable).toBe(false);

    const mockPromptEvent = new Event("beforeinstallprompt") as any;
    mockPromptEvent.prompt = vi.fn().mockResolvedValue(undefined);
    mockPromptEvent.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });

    act(() => {
      window.dispatchEvent(mockPromptEvent);
    });

    expect(result.current.isInstallable).toBe(true);

    let installed = false;
    await act(async () => {
      installed = await result.current.promptInstall();
    });

    expect(mockPromptEvent.prompt).toHaveBeenCalled();
    expect(installed).toBe(true);
    expect(result.current.isInstalled).toBe(true);
  });

  it("renders InstallPwaBanner when app is installable or forceShow is active", async () => {
    render(<InstallPwaBanner forceShow={true} />);

    expect(screen.getByText("Install StormSale App")).toBeDefined();
    expect(screen.getByText(/Mobile & Desktop/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Install App/i })).toBeDefined();

    // Dismiss banner
    const dismissBtn = screen.getByLabelText("Dismiss install prompt");
    fireEvent.click(dismissBtn);

    expect(screen.queryByText("Install StormSale App")).toBeNull();
  });
});
