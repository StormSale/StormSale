// @vitest-environment jsdom
/**
 * b2c: affiliate leaderboard ranking + gamification badge tests (#455)
 *
 * Covers:
 *  - Sorting by weekly volume, monthly volume and conversion count
 *  - Gold / Silver / Bronze rendering for the top 3 affiliates (podium + table rank pills)
 *  - Podium hover ("ranking animation") configuration
 *  - Milestone badge rendering and unlock conditions
 *  - Current-user position indicator
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userAddress: null as string | null,
  showNotification: vi.fn(),
}));

vi.mock("../context/Web3Context", () => ({
  useWeb3: () => ({ userAddress: mocks.userAddress, connectorType: "freighter" }),
  Web3Provider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: mocks.showNotification }),
}));
vi.mock("../lib/stellar", () => ({
  mintMilestoneBadgeContractCall: vi.fn(),
}));
vi.mock("../config/stellar", () => ({
  STELLAR_CONFIG: { explorerUrl: "https://stellar.expert/explorer/testnet/tx" },
}));
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const strip = (tag: string) => {
    const Comp = ({
      children,
      whileHover,
      ...props
    }: { children?: ReactNode; whileHover?: unknown } & Record<string, unknown>) =>
      React.createElement(
        tag,
        // Expose the hover animation config so the podium "ranking animation" can be asserted.
        { ...props, "data-while-hover": whileHover ? JSON.stringify(whileHover) : undefined },
        children,
      );
    return Comp;
  };
  return {
    motion: { div: strip("div"), tr: strip("tr"), button: strip("button"), span: strip("span") },
    AnimatePresence: ({ children }: { children?: ReactNode }) => children,
  };
});

import { AffiliateLeaderboard } from "../components/affiliate/AffiliateLeaderboard";
import {
  getAffiliateProfile,
  getLeaderboardRankings,
  saveClaimedBadge,
  setAffiliatePrivacy,
  setUserGrossSales,
} from "../lib/affiliateLeaderboard";
import type { ClaimedMilestoneRecord, MilestoneTier } from "../types/affiliateLeaderboard";

const USER = "GBTESTLEADERBOARDUSERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function badgeRecord(address: string, tier: MilestoneTier): ClaimedMilestoneRecord {
  return {
    tier,
    tokenId: `SBT-${tier}`,
    txHash: `0xtx${tier}`,
    claimedAt: "2025-01-01T00:00:00Z",
    nonTransferable: true,
    tokenUri: `ipfs://${tier}`,
    contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    affiliateAddress: address,
  };
}

/** Table body rows (excludes the header row). */
function tableRows(): HTMLTableRowElement[] {
  const table = screen.getByRole("table");
  return within(table).getAllByRole("row").slice(1) as HTMLTableRowElement[];
}

function cellsOf(row: HTMLTableRowElement) {
  const cells = row.querySelectorAll("td");
  return {
    rank: Number(cells[0].textContent),
    volume: Number((cells[2].querySelector("div")?.textContent ?? "").replace(/[$,]/g, "")),
    conversions: Number(cells[3].querySelector("div")?.textContent),
  };
}

function expectNonIncreasing(values: number[]) {
  for (let i = 1; i < values.length; i++) {
    expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
  }
}

describe("b2c leaderboard: sorting (lib)", () => {
  beforeEach(() => localStorage.clear());

  it("sorts by weekly volume descending and assigns sequential ranks", () => {
    const { items } = getLeaderboardRankings("weekly", "", "sales", null);
    expect(items.length).toBe(50);
    expectNonIncreasing(items.map((i) => i.weeklyGrossSales));
    expect(items.map((i) => i.rank)).toEqual(items.map((_, idx) => idx + 1));
  });

  it("sorts by monthly volume descending", () => {
    const { items } = getLeaderboardRankings("monthly", "", "sales", null);
    expectNonIncreasing(items.map((i) => i.monthlyGrossSales));
    expect(items[0].rank).toBe(1);
  });

  it("sorts by conversion count (verified sales) descending regardless of timeframe", () => {
    for (const tf of ["weekly", "monthly", "all-time"] as const) {
      const { items } = getLeaderboardRankings(tf, "", "conversions", null);
      expectNonIncreasing(items.map((i) => i.verifiedSalesCount));
    }
  });

  it("ranks the same affiliates differently by weekly vs monthly volume when data diverges", () => {
    setUserGrossSales(USER, { weekly: 5_000_000, monthly: 2_000, allTime: 3_000 });
    const weekly = getLeaderboardRankings("weekly", "", "sales", USER).items;
    const monthly = getLeaderboardRankings("monthly", "", "sales", USER).items;
    expect(weekly[0].address).toBe(USER);
    expect(monthly[0].address).not.toBe(USER);
  });
});

describe("b2c leaderboard: sorting (UI)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.userAddress = null;
  });
  afterEach(cleanup);

  it("defaults to monthly volume ordering", () => {
    render(createElement(AffiliateLeaderboard));
    const rows = tableRows().map(cellsOf);
    expect(rows.length).toBe(50);
    expectNonIncreasing(rows.map((r) => r.volume));
    expect(rows.map((r) => r.rank)).toEqual(rows.map((_, i) => i + 1));
    const expectedTop = getLeaderboardRankings("monthly", "", "sales", null).items[0];
    expect(rows[0].volume).toBe(expectedTop.monthlyGrossSales);
  });

  it("re-sorts by weekly volume when 'This Week' is selected", () => {
    render(createElement(AffiliateLeaderboard));
    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    const rows = tableRows().map(cellsOf);
    expectNonIncreasing(rows.map((r) => r.volume));
    const expected = getLeaderboardRankings("weekly", "", "sales", null).items;
    expect(rows.map((r) => r.volume)).toEqual(expected.map((i) => i.weeklyGrossSales));
  });

  it("re-sorts by all-time volume when 'All-Time' is selected", () => {
    render(createElement(AffiliateLeaderboard));
    fireEvent.click(screen.getByRole("button", { name: "All-Time" }));
    const rows = tableRows().map(cellsOf);
    expect(rows.map((r) => r.volume)).toEqual(
      getLeaderboardRankings("all-time", "", "sales", null).items.map((i) => i.allTimeGrossSales),
    );
  });

  it("re-sorts by conversion count when 'Sales #' is selected", () => {
    render(createElement(AffiliateLeaderboard));
    fireEvent.click(screen.getByRole("button", { name: "Sales #" }));
    const rows = tableRows().map(cellsOf);
    expectNonIncreasing(rows.map((r) => r.conversions));
    expect(rows.map((r) => r.conversions)).toEqual(
      getLeaderboardRankings("monthly", "", "conversions", null).items.map(
        (i) => i.verifiedSalesCount,
      ),
    );
  });

  it("switches back to volume ordering after sorting by conversions", () => {
    render(createElement(AffiliateLeaderboard));
    fireEvent.click(screen.getByRole("button", { name: "Sales #" }));
    fireEvent.click(screen.getByRole("button", { name: "Volume" }));
    expectNonIncreasing(tableRows().map((r) => cellsOf(r).volume));
  });
});

describe("b2c leaderboard: top 3 gold / silver / bronze", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.userAddress = null;
  });
  afterEach(cleanup);

  it("renders Champion (gold), #2 (silver) and #3 (bronze) podium cards for the top 3", () => {
    render(createElement(AffiliateLeaderboard));
    expect(screen.getByText(/#1 Champion/)).toBeTruthy();
    expect(screen.getByText(/#2 Rank/)).toBeTruthy();
    expect(screen.getByText(/#3 Rank/)).toBeTruthy();

    const top3 = getLeaderboardRankings("monthly", "", "sales", null).items.slice(0, 3);
    const podium = screen.getByText(/#1 Champion/).closest("div[data-while-hover]")!
      .parentElement as HTMLElement;
    for (const affiliate of top3) {
      // Masked affiliates show their pseudonym; public ones show the masked address.
      const shown = affiliate.isPrivacyMasked ? affiliate.pseudonym : affiliate.maskedAddress;
      expect(within(podium).getByText(shown)).toBeTruthy();
    }
  });

  it("styles the gold, silver and bronze podium labels distinctly", () => {
    render(createElement(AffiliateLeaderboard));
    expect(screen.getByText(/#1 Champion/).className).toContain("from-amber-400");
    expect(screen.getByText(/#2 Rank/).className).toContain("bg-slate-300");
    expect(screen.getByText(/#3 Rank/).className).toContain("bg-amber-700");
  });

  it("applies gold, silver and bronze rank pills to rows 1-3 only", () => {
    render(createElement(AffiliateLeaderboard));
    const pills = tableRows().map((r) => r.querySelector("td span") as HTMLElement);
    expect(pills[0].className).toContain("bg-amber-400");
    expect(pills[1].className).toContain("bg-slate-300");
    expect(pills[2].className).toContain("bg-amber-700");
    for (const pill of pills.slice(3)) {
      expect(pill.className).not.toMatch(/bg-amber-400|bg-slate-300|bg-amber-700/);
    }
  });

  it("updates the podium to match the selected timeframe", () => {
    render(createElement(AffiliateLeaderboard));
    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    const weeklyChampion = getLeaderboardRankings("weekly", "", "sales", null).items[0];
    const championCard = screen.getByText(/#1 Champion/).closest("div[data-while-hover]")!;
    expect(
      within(championCard as HTMLElement).getByText(
        `$${weeklyChampion.weeklyGrossSales.toLocaleString()}`,
      ),
    ).toBeTruthy();
  });

  it("hides the podium while searching and shows it again when cleared", () => {
    render(createElement(AffiliateLeaderboard));
    const input = screen.getByPlaceholderText("Search address or pseudonym...");
    fireEvent.change(input, { target: { value: "G" } });
    expect(screen.queryByText(/#1 Champion/)).toBeNull();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText(/#1 Champion/)).toBeTruthy();
  });

  it("configures a hover lift animation on the podium, strongest for the champion", () => {
    render(createElement(AffiliateLeaderboard));
    const lift = (label: RegExp) =>
      JSON.parse(
        screen.getByText(label).closest("div[data-while-hover]")!.getAttribute("data-while-hover")!,
      ).y as number;
    expect(lift(/#1 Champion/)).toBe(-8);
    expect(lift(/#2 Rank/)).toBe(-6);
    expect(lift(/#3 Rank/)).toBe(-6);
  });

  it("shows the pseudonym instead of the address when a top-3 affiliate has stealth privacy on", () => {
    const top = getLeaderboardRankings("monthly", "", "sales", null).items[0];
    setAffiliatePrivacy(top.address, true);
    render(createElement(AffiliateLeaderboard));
    const champion = screen
      .getByText(/#1 Champion/)
      .closest("div[data-while-hover]") as HTMLElement;
    expect(within(champion).getByRole("heading", { level: 4 }).textContent).toBe(top.pseudonym);
  });
});

describe("b2c leaderboard: milestone badge rendering & unlock conditions", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.userAddress = null;
  });
  afterEach(cleanup);

  it("shows a dash in the trophies column for an affiliate with no claimed badges", () => {
    // Every seeded affiliate holds at least the $1K badge, so use a connected user below $1K.
    mocks.userAddress = USER;
    setUserGrossSales(USER, { monthly: 500, weekly: 140, allTime: 2_100 });
    render(createElement(AffiliateLeaderboard));
    fireEvent.change(screen.getByPlaceholderText("Search address or pseudonym..."), {
      target: { value: USER },
    });
    const rows = tableRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelectorAll("td")[4].textContent).toBe("—");
  });

  it("renders G / S / B letters for the 100k / 10k / 1k tiers in the trophies column", () => {
    const top = getLeaderboardRankings("monthly", "", "sales", null).items[0];
    saveClaimedBadge(badgeRecord(top.address, "1k"));
    saveClaimedBadge(badgeRecord(top.address, "10k"));
    saveClaimedBadge(badgeRecord(top.address, "100k"));
    render(createElement(AffiliateLeaderboard));

    const trophies = tableRows()[0].querySelectorAll("td")[4];
    const letters = Array.from(trophies.querySelectorAll("span")).map((s) => s.textContent);
    expect(letters).toEqual(["B", "S", "G"]);
    expect(trophies.querySelector('[title="$1K Bronze Pioneer"]')).toBeTruthy();
  });

  it("shows the tier titles on the champion podium card for claimed badges", () => {
    const top = getLeaderboardRankings("monthly", "", "sales", null).items[0];
    saveClaimedBadge(badgeRecord(top.address, "100k"));
    render(createElement(AffiliateLeaderboard));
    const champion = screen
      .getByText(/#1 Champion/)
      .closest("div[data-while-hover]") as HTMLElement;
    expect(within(champion).getByText(/100K Titan/)).toBeTruthy();
  });

  it("unlocks tiers only when gross sales reach each threshold", () => {
    const cases: Array<[number, MilestoneTier[]]> = [
      [999, []],
      [1_000, ["1k"]],
      [9_999, ["1k"]],
      [10_000, ["1k", "10k"]],
      [99_999, ["1k", "10k"]],
      [100_000, ["1k", "10k", "100k"]],
    ];
    for (const [sales, expected] of cases) {
      localStorage.clear();
      setUserGrossSales(USER, { monthly: sales, weekly: sales, allTime: sales });
      expect(getAffiliateProfile(USER, USER).unlockedTiers).toEqual(expected);
    }
  });

  it("shows the next milestone and remaining volume for a partially progressed affiliate", () => {
    setUserGrossSales(USER, { monthly: 2_500, weekly: 2_500, allTime: 2_500 });
    const { nextMilestoneProgress } = getAffiliateProfile(USER, USER);
    expect(nextMilestoneProgress.nextTier).toBe("10k");
    expect(nextMilestoneProgress.remainingSales).toBe(7_500);
  });
});

describe("b2c leaderboard: current-user position indicator", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.userAddress = null;
  });
  afterEach(cleanup);

  it("does not render a 'You' indicator when no wallet is connected", () => {
    render(createElement(AffiliateLeaderboard));
    expect(screen.queryByText("You")).toBeNull();
  });

  it("highlights exactly one row with a 'You' tag for the connected affiliate", () => {
    mocks.userAddress = USER;
    setUserGrossSales(USER, { monthly: 5_000, weekly: 1_400, allTime: 21_000 });
    render(createElement(AffiliateLeaderboard));

    const youTags = screen.getAllByText("You");
    expect(youTags).toHaveLength(1);

    const highlighted = tableRows().filter((r) => r.className.includes("bg-indigo-50/50"));
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toContain("You");
  });

  it("places the highlighted row at the user's computed rank", () => {
    mocks.userAddress = USER;
    setUserGrossSales(USER, { monthly: 5_000, weekly: 1_400, allTime: 21_000 });
    render(createElement(AffiliateLeaderboard));

    const expectedRank = getLeaderboardRankings("monthly", "", "sales", USER).items.find(
      (i) => i.address === USER,
    )!.rank;
    // The user may fall outside the top 50; only assert when listed.
    const row = tableRows().find((r) => r.className.includes("bg-indigo-50/50"));
    if (expectedRank <= 50) {
      expect(row).toBeTruthy();
      expect(cellsOf(row!).rank).toBe(expectedRank);
    } else {
      expect(row).toBeUndefined();
    }
  });

  it("moves the user to #1 with the gold pill when their volume tops the board", () => {
    mocks.userAddress = USER;
    setUserGrossSales(USER, { monthly: 9_999_999 });
    render(createElement(AffiliateLeaderboard));

    const [first] = tableRows();
    expect(cellsOf(first).rank).toBe(1);
    expect(first.className).toContain("bg-indigo-50/50");
    expect(within(first).getByText("You")).toBeTruthy();
    expect((first.querySelector("td span") as HTMLElement).className).toContain("bg-amber-400");
  });

  it("repositions the highlighted row when the timeframe changes the user's rank", () => {
    mocks.userAddress = USER;
    setUserGrossSales(USER, { weekly: 5_000_000, monthly: 2_000, allTime: 3_000 });
    render(createElement(AffiliateLeaderboard));

    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    expect(cellsOf(tableRows()[0]).rank).toBe(1);
    expect(tableRows()[0].className).toContain("bg-indigo-50/50");

    fireEvent.click(screen.getByRole("button", { name: /This Month/ }));
    expect(tableRows()[0].className).not.toContain("bg-indigo-50/50");
  });

  it("matches a seeded affiliate case-insensitively without duplicating their row", () => {
    // Seeded addresses contain uppercase characters; connect with the lowercased form.
    const seeded = getLeaderboardRankings("monthly", "", "sales", null).items[0];
    expect(seeded.address).not.toBe(seeded.address.toLowerCase());
    const lower = seeded.address.toLowerCase();
    mocks.userAddress = lower;
    setUserGrossSales(lower, { monthly: 9_999_999 });

    const { items } = getLeaderboardRankings("monthly", "", "sales", lower);
    expect(items.filter((i) => i.address.toLowerCase() === lower)).toHaveLength(1);
    expect(items).toHaveLength(50);

    render(createElement(AffiliateLeaderboard));
    const rows = tableRows();
    expect(rows).toHaveLength(50);
    expect(screen.getAllByText("You")).toHaveLength(1);
    expect(within(rows[0]).getByText("You")).toBeTruthy();
  });

  it("keeps the 'You' tag when the user masks their address", () => {
    mocks.userAddress = USER;
    setUserGrossSales(USER, { monthly: 9_999_999 });
    render(createElement(AffiliateLeaderboard));
    fireEvent.click(screen.getByRole("button", { name: /Mask My Address/ }));
    const [first] = tableRows();
    expect(within(first).getByText("You")).toBeTruthy();
    expect(within(first).getByText("Masked")).toBeTruthy();
  });
});
