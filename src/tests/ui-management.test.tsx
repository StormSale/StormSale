// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { TooltipProvider } from "../components/ui/tooltip";
import { UserMenu } from "../components/shared/UserMenu";
import { Header } from "../components/shared/Header";
import { EscrowReserveIndicator } from "../components/advertiser/EscrowReserveIndicator";

const mockVerifyFreighterNetwork = vi.hoisted(() => vi.fn());

const mockWeb3: {
  userAddress: string | null;
  userRole: string | null;
  xlmBalance: string;
  isConnected: boolean;
  isMultiSigAccount: boolean;
  multiSigInfo: { signers: string[] } | null;
  activeRpcEndpoint: {
    name: string;
    status: "healthy" | "degraded" | "unreachable";
    type: "primary" | "local" | "blockdag";
    latencyMs: number | null;
  };
  network: string;
  connectorType: "freighter" | "mock" | null;
  isStellarNetwork: boolean;
  updateUserRole: ReturnType<typeof vi.fn>;
  disconnectWallet: ReturnType<typeof vi.fn>;
  openWalletModal: ReturnType<typeof vi.fn>;
  openMultiSigModal: ReturnType<typeof vi.fn>;
  openRpcModal: ReturnType<typeof vi.fn>;
  switchToStellarNetwork: ReturnType<typeof vi.fn>;
} = {
  userAddress: "GABCDEF1234567890",
  userRole: "ADVERTISER",
  xlmBalance: "12.50",
  isConnected: true,
  isMultiSigAccount: false,
  multiSigInfo: null,
  activeRpcEndpoint: { name: "Primary RPC", status: "healthy", type: "primary", latencyMs: 28 },
  network: "TESTNET",
  connectorType: "freighter",
  isStellarNetwork: true,
  updateUserRole: vi.fn().mockResolvedValue(undefined),
  disconnectWallet: vi.fn(),
  openWalletModal: vi.fn(),
  openMultiSigModal: vi.fn(),
  openRpcModal: vi.fn(),
  switchToStellarNetwork: vi.fn().mockResolvedValue(true),
};

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => mockWeb3,
}));

vi.mock("../lib/escrowAutoRefill", () => ({}));
vi.mock("../lib/networkVerification", () => ({
  verifyFreighterNetwork: mockVerifyFreighterNetwork,
}));

vi.mock("../hooks/useTelegram", () => ({
  useTelegram: () => ({ isTelegram: false, user: null, platform: "web" }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  mockWeb3.updateUserRole.mockResolvedValue(true);
  mockVerifyFreighterNetwork.mockResolvedValue({ network: "TESTNET", isStellarNetwork: true });
  Object.assign(mockWeb3, {
    userAddress: "GABCDEF1234567890",
    userRole: "ADVERTISER",
    xlmBalance: "12.50",
    isConnected: true,
    isMultiSigAccount: false,
    multiSigInfo: null,
    activeRpcEndpoint: {
      name: "Primary RPC",
      status: "healthy",
      type: "primary",
      latencyMs: 28,
    },
    network: "TESTNET",
    connectorType: "freighter",
    isStellarNetwork: true,
  });
});

function renderTabs(props: { queryParam?: string; storageKey?: string } = {}) {
  return render(
    <Tabs defaultValue="overview" queryParam={props.queryParam} storageKey={props.storageKey}>
      <TabsList aria-label="Campaign views">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview panel</TabsContent>
      <TabsContent value="activity">Activity panel</TabsContent>
    </Tabs>,
  );
}

describe("UI management components", () => {
  it("uses the default tab for invalid URLs and synchronizes keyboard and history navigation", async () => {
    window.history.replaceState({}, "", "/?view=unknown");
    renderTabs({ queryParam: "view", storageKey: "campaign-view" });

    expect(screen.getByText("Overview panel")).toBeTruthy();
    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });

    expect(screen.getByText("Activity panel")).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("view")).toBe("activity");

    window.history.replaceState({}, "", "/");
    fireEvent.popState(window);
    await waitFor(() => expect(screen.getByText("Overview panel")).toBeTruthy());
  });

  it("persists an uncontrolled selection across remounts", () => {
    const firstRender = renderTabs({ storageKey: "persisted-view" });
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByText("Activity panel")).toBeTruthy();
    firstRender.unmount();

    renderTabs({ storageKey: "persisted-view" });
    expect(screen.getByText("Activity panel")).toBeTruthy();
  });

  it("does not persist a keyless tab value across remounts", () => {
    const firstRender = renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    firstRender.unmount();

    renderTabs();
    expect(screen.getByText("Overview panel")).toBeTruthy();
  });

  it("replaces inactive panels immediately while retaining the enter animation", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));

    expect(screen.queryByText("Overview panel")).toBeNull();
    expect(screen.getByText("Activity panel")).toBeTruthy();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("renders semantic badge colors, an icon, and a focusable tooltip trigger", () => {
    const { container } = render(
      <TooltipProvider>
        <Badge variant="emerald" icon={Sparkles} tooltip="Campaign is active">
          Active
        </Badge>
        <Badge variant="amber">Review</Badge>
        <Badge variant="rose">Blocked</Badge>
        <Badge variant="indigo">Campaign</Badge>
      </TooltipProvider>,
    );

    const badges = container.querySelectorAll("span");
    expect(badges[0].className).toContain("text-emerald-700");
    expect(badges[0].getAttribute("tabindex")).toBe("0");
    expect(badges[0].querySelector("svg")).toBeTruthy();
    expect(badges[1].className).toContain("text-amber-800");
    expect(badges[2].className).toContain("text-rose-700");
    expect(badges[3].className).toContain("text-indigo-700");
  });

  it("exposes interactive badge content through a keyboard-operable popover", () => {
    render(
      <TooltipProvider>
        <Badge variant="amber" popoverContent={<button type="button">Open settings</button>}>
          Review
        </Badge>
      </TooltipProvider>,
    );
    const badge = screen.getByRole("button", { name: "Review" });
    badge.focus();
    fireEvent.keyDown(badge, { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open settings" })).toBeTruthy();
  });

  it("uses the semantic campaign badge to open escrow settings by keyboard", () => {
    const onOpenSettings = vi.fn();
    const status = {
      campaignId: "campaign-1",
      currentBalanceXlm: 3,
      initialBudgetXlm: 100,
      remainingPercent: 3,
      thresholdPercent: 15,
      thresholdBalanceXlm: 15,
      isLowReserve: true,
      warningLevel: "critical",
    } as const;
    render(
      <EscrowReserveIndicator
        status={status}
        onOpenSettings={onOpenSettings}
        onQuickRefill={vi.fn()}
      />,
    );

    const badge = screen.getByRole("button", { name: "Escrow status: Critical Reserve" });
    badge.focus();
    fireEvent.keyDown(badge, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Configure refill threshold" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "1-Click Refill" })).toBeTruthy();
  });

  it("renders the warning reserve state with an optional refill action", () => {
    const status = {
      campaignId: "campaign-2",
      currentBalanceXlm: 10,
      initialBudgetXlm: 100,
      remainingPercent: 10,
      thresholdPercent: 15,
      thresholdBalanceXlm: 15,
      isLowReserve: true,
      warningLevel: "warning",
    } as const;
    render(
      <TooltipProvider>
        <EscrowReserveIndicator status={status} onQuickRefill={vi.fn()} isRefilling />
      </TooltipProvider>,
    );

    expect(screen.getByRole("status", { name: "Escrow status: Low Reserve (< 15%)" })).toBeTruthy();
    expect(screen.getByRole("progressbar").className).toContain("bg-amber-500");
    expect(
      (screen.getByRole("button", { name: "1-Click Refill" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("renders the healthy reserve state without a refill action", () => {
    const status = {
      campaignId: "campaign-3",
      currentBalanceXlm: 80,
      initialBudgetXlm: 100,
      remainingPercent: 80,
      thresholdPercent: 15,
      thresholdBalanceXlm: 15,
      isLowReserve: false,
      warningLevel: "healthy",
    } as const;
    render(
      <TooltipProvider>
        <EscrowReserveIndicator status={status} />
      </TooltipProvider>,
    );

    expect(screen.getByRole("status", { name: "Escrow status: Escrow Healthy" })).toBeTruthy();
    expect(screen.getByRole("progressbar").className).toContain("bg-emerald-500");
    expect(screen.queryByRole("button", { name: "1-Click Refill" })).toBeNull();
  });

  it("shows only the active role dashboard link and switches roles through Web3 state", async () => {
    const onNavigate = vi.fn();
    let rerenderMenu = () => {};
    mockWeb3.updateUserRole.mockImplementation(async (role: string) => {
      mockWeb3.userRole = role;
      await new Promise<void>((resolve) => {
        window.setTimeout(() => {
          rerenderMenu();
          resolve();
        }, 0);
      });
    });
    const view = render(<UserMenu onNavigate={onNavigate} />);
    rerenderMenu = () => view.rerender(<UserMenu onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    expect(screen.getByRole("button", { name: "Advertiser dashboard" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Affiliate dashboard" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Affiliate$/ }));
    expect(mockWeb3.updateUserRole).toHaveBeenCalledWith("AFFILIATE");
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("affiliate"));
  });

  it("edits and persists the wallet-local profile name", () => {
    render(<UserMenu />);
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit local profile name" }));
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Morgan" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(window.localStorage.getItem("stormsale.profile.displayName.GABCDEF1234567890")).toBe(
      "Morgan",
    );
    expect(screen.getByRole("button", { name: "Account menu for Morgan" })).toBeTruthy();
  });

  it("reloads the profile and clears account state when the wallet changes", () => {
    window.localStorage.setItem("stormsale.profile.displayName.GABCDEF1234567890", "Morgan");
    window.localStorage.setItem("stormsale.profile.displayName.GNEWADDRESS123456789", "Riley");
    const view = render(<UserMenu />);
    expect(screen.getByRole("button", { name: "Account menu for Morgan" })).toBeTruthy();

    mockWeb3.userAddress = "GNEWADDRESS123456789";
    view.rerender(<UserMenu />);
    expect(screen.getByRole("button", { name: "Account menu for Riley" })).toBeTruthy();
  });

  it("supports role dashboard navigation and disconnects the wallet", () => {
    const onNavigate = vi.fn();
    let rerenderMenu = () => {};
    mockWeb3.updateUserRole.mockImplementation(async (role: string) => {
      mockWeb3.userRole = role;
      await new Promise<void>((resolve) => {
        window.setTimeout(() => {
          rerenderMenu();
          resolve();
        }, 0);
      });
    });
    mockWeb3.userRole = "AUDITOR";
    const view = render(<UserMenu onNavigate={onNavigate} />);
    rerenderMenu = () => view.rerender(<UserMenu onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    fireEvent.click(screen.getByRole("button", { name: "Auditor dashboard" }));
    expect(onNavigate).toHaveBeenCalledWith("auditor");

    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect wallet" }));
    expect(mockWeb3.disconnectWallet).toHaveBeenCalledOnce();
  });

  it("keeps the menu open and shows an error when role update fails", async () => {
    const onNavigate = vi.fn();
    mockWeb3.updateUserRole.mockResolvedValue(undefined);
    render(<UserMenu onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    fireEvent.click(screen.getByRole("button", { name: /Affiliate$/ }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Advertiser dashboard" })).toBeTruthy();
  });

  it("does not render an account menu without a connected address", () => {
    mockWeb3.userAddress = null;
    const { container } = render(<UserMenu />);
    expect(container.firstChild).toBeNull();
  });

  it("renders connected header controls and switches to Stellar when prompted", async () => {
    mockWeb3.isMultiSigAccount = true;
    mockWeb3.multiSigInfo = { signers: ["G1", "G2"] };
    mockWeb3.isStellarNetwork = false;
    mockVerifyFreighterNetwork.mockResolvedValue({ network: "PUBLIC", isStellarNetwork: false });
    const view = render(
      <TooltipProvider>
        <Header onNavigate={vi.fn()} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Verify wallet network" })[0]);
    await waitFor(() => expect(mockVerifyFreighterNetwork).toHaveBeenCalled());
    expect(screen.getByRole("status").textContent).toContain("Wallet is on PUBLIC");
    expect(screen.getByRole("button", { name: /Multi-Sig \(2\)/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Menu" }));
    expect(screen.getByText("CONNECTED WALLET")).toBeTruthy();
    fireEvent.click(screen.getByText("Multi-Sig Escrow Approvals").closest("button")!);
    expect(mockWeb3.openMultiSigModal).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Menu" }));
    fireEvent.click(screen.getAllByRole("link", { name: "About Us" })[1]);
    await waitFor(() => expect(screen.queryByText("CONNECTED WALLET")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Toggle Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Wallet" }));
    expect(mockWeb3.disconnectWallet).toHaveBeenCalledOnce();
    act(() => {
      mockWeb3.isConnected = false;
      mockWeb3.userAddress = null;
      view.rerender(
        <TooltipProvider>
          <Header onNavigate={vi.fn()} />
        </TooltipProvider>,
      );
    });
    await waitFor(() => expect(screen.queryByText("CONNECTED WALLET")).toBeNull());
    expect(screen.queryByRole("button", { name: "Disconnect Wallet" })).toBeNull();
  });

  it("shows connect actions when disconnected in both desktop and mobile navigation", () => {
    mockWeb3.isConnected = false;
    render(
      <TooltipProvider>
        <Header />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Connect Wallet" })[0]);
    expect(mockWeb3.openWalletModal).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Stellar Wallet" }));
    expect(mockWeb3.openWalletModal).toHaveBeenCalledTimes(2);
  });
});
