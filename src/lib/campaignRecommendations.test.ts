import { describe, expect, it } from "vitest";
import {
  FEATURED_CAMPAIGNS,
  getCampaignRecommendations,
  scoreCampaign,
} from "./campaignRecommendations";

describe("campaign recommendations", () => {
  it("ranks niche matches above otherwise similar campaigns", () => {
    const recommendations = getCampaignRecommendations(["gaming", "hardware"]);

    expect(recommendations[0].id).toBe("pixel-forge");
    expect(recommendations[0].score).toBeGreaterThan(
      scoreCampaign(FEATURED_CAMPAIGNS[0], ["gaming", "hardware"]),
    );
  });

  it("combines conversion rate, escrow solvency, and niche similarity", () => {
    const campaign = FEATURED_CAMPAIGNS[0];
    const fullScore = scoreCampaign(campaign, ["defi", "finance"]);
    const noNicheScore = scoreCampaign(campaign, []);

    expect(fullScore).toBeGreaterThan(noNicheScore);
    expect(scoreCampaign({ ...campaign, escrowBalance: 0 }, ["defi", "finance"])).toBeLessThan(
      fullScore,
    );
    expect(scoreCampaign({ ...campaign, conversionRate: 0 }, ["defi", "finance"])).toBeLessThan(
      fullScore,
    );
  });

  it("caps conversion and solvency contributions at their normalized maximum", () => {
    const campaign = FEATURED_CAMPAIGNS[0];

    expect(
      scoreCampaign({ ...campaign, conversionRate: 20, escrowBalance: campaign.escrowTarget * 2 }, [
        "defi",
        "finance",
      ]),
    ).toBe(100);
  });

  it("returns a deterministic ordering when no niches have been selected", () => {
    const recommendations = getCampaignRecommendations([]);

    expect(recommendations).toHaveLength(FEATURED_CAMPAIGNS.length);
    expect(recommendations.map(({ score }) => score)).toEqual(
      [...recommendations].map(({ score }) => score).sort((left, right) => right - left),
    );
  });
});
