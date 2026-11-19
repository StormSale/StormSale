// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { getCreateCampaignSchema } from "../lib/validation";
import { CreateCampaignForm } from "../components/advertiser/CreateCampaignForm";
import { NotificationProvider } from "../context/NotificationContext";

const mockWeb3 = {
  userAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
  isConnected: true,
  createCampaignOnChain: vi.fn(),
  tokenAllowance: 1000,
  refreshTokenAllowance: vi.fn().mockResolvedValue(0),
  approveTokenAllowance: vi.fn().mockResolvedValue({ success: true }),
  assetBalances: { XLM: "5000" },
  getCampaignContract: vi.fn(),
};

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => mockWeb3,
  useSafeWeb3: () => mockWeb3,
}));

vi.mock("../hooks/useAccountReserve", () => ({
  useAccountReserve: () => ({
    spendableXlm: 1000,
    reserveXlm: 1,
    balanceXlm: 1001,
    baseReserveXlm: 0.5,
    isReady: true,
    refresh: vi.fn(),
  }),
}));

describe("Campaign validation with daily cap and attribution (#156, #151)", () => {
  const schema = getCreateCampaignSchema(7);

  const validBase = {
    campaignName: "Test Pro Campaign",
    commissionRate: "10",
    budget: "1000",
    clearingPeriod: "86400",
  };

  it("accepts valid optional daily payout cap", () => {
    const valid = {
      ...validBase,
      dailyPayoutCap: "1000",
    };
    const res = schema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it("rejects non-numeric or non-positive daily payout cap", () => {
    const invalidNonNumeric = {
      ...validBase,
      dailyPayoutCap: "abc",
    };
    expect(schema.safeParse(invalidNonNumeric).success).toBe(false);

    const invalidZero = {
      ...validBase,
      dailyPayoutCap: "0",
    };
    expect(schema.safeParse(invalidZero).success).toBe(false);

    const invalidNegative = {
      ...validBase,
      dailyPayoutCap: "-50",
    };
    expect(schema.safeParse(invalidNegative).success).toBe(false);
  });

  it("accepts valid attribution models ('last_click', 'first_click')", () => {
    expect(schema.safeParse({ ...validBase, attributionModel: "last_click" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, attributionModel: "first_click" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, attributionModel: "invalid_model" }).success).toBe(
      false,
    );
  });

  it("accepts valid attribution windows ('1', '7', '30', '60')", () => {
    for (const days of ["1", "7", "30", "60"] as const) {
      expect(schema.safeParse({ ...validBase, attributionWindowDays: days }).success).toBe(true);
    }
    expect(schema.safeParse({ ...validBase, attributionWindowDays: "45" }).success).toBe(false);
  });

  describe("CreateCampaignForm UI Controls (#156, #151)", () => {
    const renderForm = () =>
      render(
        <NotificationProvider>
          <CreateCampaignForm />
        </NotificationProvider>,
      );

    it("allows entering daily payout cap and clearing validation errors", () => {
      renderForm();

      const capInput = screen.getByTestId("input-daily-payout-cap") as HTMLInputElement;
      expect(capInput).toBeTruthy();

      fireEvent.change(capInput, { target: { value: "1500" } });
      expect(capInput.value).toBe("1500");
    });

    it("allows toggling attribution model between Last-Click and First-Click", () => {
      renderForm();

      const lastClickBtn = screen.getByTestId("btn-attr-last-click");
      const firstClickBtn = screen.getByTestId("btn-attr-first-click");

      expect(lastClickBtn).toBeTruthy();
      expect(firstClickBtn).toBeTruthy();

      fireEvent.click(firstClickBtn);
      fireEvent.click(lastClickBtn);
    });

    it("allows selecting attribution window presets (1d, 7d, 30d, 60d)", () => {
      renderForm();

      const win1 = screen.getByTestId("btn-attr-window-1");
      const win7 = screen.getByTestId("btn-attr-window-7");
      const win30 = screen.getByTestId("btn-attr-window-30");
      const win60 = screen.getByTestId("btn-attr-window-60");

      fireEvent.click(win1);
      fireEvent.click(win7);
      fireEvent.click(win60);
      fireEvent.click(win30);
    });
  });
});
