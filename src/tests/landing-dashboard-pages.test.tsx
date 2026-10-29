// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useWeb3: vi.fn(),
  useDashboardCache: vi.fn(),
}));

vi.mock("../context/Web3Context", () => ({ useWeb3: mocks.useWeb3 }));
vi.mock("../hooks/useDashboardCache", () => ({ useDashboardCache: mocks.useDashboardCache }));

import { Landing } from "../pages/Landing";
import { Dashboard } from "../pages/Dashboard";

class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("Landing mobile leaderboard drawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWeb3.mockReturnValue({
      openWalletModal: vi.fn(),
      connectWallet: vi.fn(),
    });
  });

  afterEach(() => cleanup());

  it("opens the drawer and routes Home + Leaderboard actions", () => {
    const onViewLeaderboard = vi.fn();
    const { container } = render(<Landing onViewLeaderboard={onViewLeaderboard} />);

    // Reveal the mobile navigation drawer.
    fireEvent.click(screen.getByLabelText("Toggle navigation"));

    // The drawer's Home anchor is the one styled with rounded-xl (header/hero links differ).
    const drawerHome = screen
      .getAllByText("Home")
      .find((el) => el.className.includes("rounded-xl")) as HTMLElement;
    expect(drawerHome).toBeTruthy();
    fireEvent.click(drawerHome);

    // Reopen the drawer and use its Leaderboard entry.
    fireEvent.click(screen.getByLabelText("Toggle navigation"));
    const drawerLeaderboard = screen
      .getAllByRole("button", { name: "Leaderboard" })
      .find((el) => el.className.includes("rounded-xl")) as HTMLElement;
    expect(drawerLeaderboard).toBeTruthy();
    fireEvent.click(drawerLeaderboard);

    expect(onViewLeaderboard).toHaveBeenCalledTimes(1);
    expect(container).toBeTruthy();
  });
});

describe("Dashboard leaderboard shortcut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWeb3.mockReturnValue({
      userAddress: null,
      userRole: null,
      updateUserRole: vi.fn(),
      isConnected: false,
      disconnectWallet: vi.fn(),
      network: "testnet",
      xlmBalance: "0",
      connectorType: null,
    });
    mocks.useDashboardCache.mockReturnValue({
      metrics: { xlmBalance: "0" },
      hydrated: false,
      persistMetrics: vi.fn(),
      invalidateCache: vi.fn(),
    });
  });

  afterEach(() => cleanup());

  it("navigates to the affiliate leaderboard from the role picker", () => {
    const onNavigate = vi.fn();
    render(<Dashboard onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /Affiliate Leaderboard & Badges/ }));
    expect(onNavigate).toHaveBeenCalledWith("leaderboard");
  });
});
