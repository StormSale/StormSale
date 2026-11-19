// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LogSaleForm } from "../components/advertiser/LogSaleForm";
import { NotificationProvider } from "../context/NotificationContext";

const mockLogEncryptedSale = vi.fn().mockResolvedValue({ txHash: "tx_mock_123" });
const mockGetCampaignContract = vi.fn().mockReturnValue({
  logEncryptedSale: mockLogEncryptedSale,
});

const mockWeb3State = {
  userAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  isConnected: true,
  getCampaignContract: mockGetCampaignContract,
};

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => mockWeb3State,
  useSafeWeb3: () => mockWeb3State,
}));

vi.mock("../hooks/useOrganization", () => ({
  useOrganization: () => ({
    hasCapability: () => true,
    currentRole: "Admin",
    organization: { id: "org-1", name: "Apex" },
  }),
}));

vi.mock("../lib/priceOracle", async () => {
  const actual = await vi.importActual("../lib/priceOracle");
  return {
    ...actual,
    fetchLiveOracleRates: vi.fn().mockResolvedValue({
      rates: { USD: 0.125, EUR: 0.1, USDC: 0.125 },
      source: "CoinGecko",
      updatedAt: Date.now(),
      isStale: false,
      cached: false,
    }),
  };
});

describe("LogSaleForm Multi-Currency Oracle Engine (#145)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () =>
    render(
      <NotificationProvider>
        <LogSaleForm />
      </NotificationProvider>,
    );

  it("renders live price feeds bar and oracle status indicator", async () => {
    renderComponent();

    expect(screen.getByTestId("oracle-status-bar")).toBeTruthy();
    expect(screen.getByText(/Live Price Feeds:/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/Live \(CoinGecko\)/i)).toBeTruthy();
      expect(screen.getByText(/XLM\/USD:/i)).toBeTruthy();
      expect(screen.getAllByText(/\$0\.1250/i).length).toBeGreaterThan(0);
    });
  });

  it("switches to USD fiat input and calculates live XLM equivalent", async () => {
    renderComponent();

    // Wait for oracle rates to load into state
    await waitFor(() => {
      expect(screen.getByText(/Live \(CoinGecko\)/i)).toBeTruthy();
    });

    // Click USD currency toggle
    const usdBtn = screen.getByTestId("btn-currency-USD");
    fireEvent.click(usdBtn);

    // Fiat input is displayed
    const fiatInput = screen.getByTestId("input-sale-amount-fiat");
    expect(fiatInput).toBeTruthy();

    // Enter $50 USD -> with rate 0.125 USD/XLM, $50 / 0.125 = 400 XLM
    fireEvent.change(fiatInput, { target: { value: "50" } });

    await waitFor(() => {
      expect(screen.getByText(/400\.0000 XLM/i)).toBeTruthy();
    });
  });

  it("switches to EUR fiat input and calculates live XLM equivalent", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Live \(CoinGecko\)/i)).toBeTruthy();
    });

    const eurBtn = screen.getByTestId("btn-currency-EUR");
    fireEvent.click(eurBtn);

    const fiatInput = screen.getByTestId("input-sale-amount-fiat");
    // Enter €10 EUR with rate 0.10 EUR/XLM => 10 / 0.10 = 100 XLM
    fireEvent.change(fiatInput, { target: { value: "10" } });

    await waitFor(() => {
      expect(screen.getByText(/100\.0000 XLM/i)).toBeTruthy();
    });
  });

  it("refreshes oracle rates on user click", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("btn-refresh-oracle")).toBeTruthy();
    });

    const refreshBtn = screen.getByTestId("btn-refresh-oracle");
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText(/Live \(CoinGecko\)/i)).toBeTruthy();
    });
  });

  it("handles empty or non-numeric fiat input by resetting XLM amount", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Live \(CoinGecko\)/i)).toBeTruthy();
    });

    const usdBtn = screen.getByTestId("btn-currency-USD");
    fireEvent.click(usdBtn);

    const fiatInput = screen.getByTestId("input-sale-amount-fiat");
    fireEvent.change(fiatInput, { target: { value: "50" } });

    await waitFor(() => {
      expect(screen.getByText(/400\.0000 XLM/i)).toBeTruthy();
    });

    // Clear input
    fireEvent.change(fiatInput, { target: { value: "" } });
    const xlmBtn = screen.getByTestId("btn-currency-XLM");
    fireEvent.click(xlmBtn);
    const xlmInput = screen.getByTestId("input-sale-amount-xlm") as HTMLInputElement;
    expect(xlmInput.value).toBe("");
  });

  it("converts existing XLM amount to fiat when switching currency mode", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Live \(CoinGecko\)/i)).toBeTruthy();
    });

    // Default mode is XLM, enter 100 XLM
    const xlmInput = screen.getByTestId("input-sale-amount-xlm");
    fireEvent.change(xlmInput, { target: { value: "100" } });

    // Switch to USD: 100 XLM * 0.125 = $12.50 USD
    const usdBtn = screen.getByTestId("btn-currency-USD");
    fireEvent.click(usdBtn);

    const fiatInput = screen.getByTestId("input-sale-amount-fiat") as HTMLInputElement;
    expect(fiatInput.value).toBe("12.5");

    // Switch back to XLM
    const xlmBtn = screen.getByTestId("btn-currency-XLM");
    fireEvent.click(xlmBtn);
    expect(screen.queryByTestId("input-sale-amount-fiat")).toBeNull();
  });
});
