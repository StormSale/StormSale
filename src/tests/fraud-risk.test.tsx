import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import {
  calculateTimeDeltaSeconds,
  computeStatisticalMetrics,
  calculateAffiliateVelocity,
  evaluateAffiliateRisk,
  loadPausedAffiliates,
  isAffiliatePaused,
  pauseAffiliate,
  unpauseAffiliate,
  generateMockClickToConversionRecords,
  PAUSED_AFFILIATES_STORAGE_KEY,
} from "../lib/fraudRiskEngine";
import type { ClickToConversionRecord } from "../types/fraud";
import {
  FraudRiskProvider,
  useFraudRisk,
  type FraudRiskContextType,
} from "../context/FraudRiskContext";
import { NotificationProvider } from "../context/NotificationContext";
import { Web3Provider } from "../context/Web3Context";
import { FraudRiskBadge } from "../components/advertiser/FraudRiskBadge";
import { FraudRiskPartnerTable } from "../components/advertiser/FraudRiskPartnerTable";
import { ClaimPayouts } from "../components/affiliate/ClaimPayouts";
import { getLocalStorage } from "../lib/storage";

describe("Fraud Risk Scoring Engine & Anomaly Detection (#152)", () => {
  const storage = getLocalStorage();

  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  const renderWithProviders = (ui: React.ReactNode) => {
    return renderToString(
      <Web3Provider>
        <NotificationProvider>
          <FraudRiskProvider>{ui}</FraudRiskProvider>
        </NotificationProvider>
      </Web3Provider>,
    );
  };

  describe("1. Mathematical & Statistical Distribution Calculations", () => {
    it("calculates click-to-conversion time delta in seconds accurately", () => {
      const click = "2026-10-21T12:00:00.000Z";
      const conversion = "2026-10-21T12:00:45.500Z";
      const delta = calculateTimeDeltaSeconds(click, conversion);

      expect(delta).toBeCloseTo(45.5, 6);
    });

    it("clamps negative time deltas to zero gracefully", () => {
      const click = "2026-10-21T12:01:00.000Z";
      const conversion = "2026-10-21T12:00:00.000Z";
      const delta = calculateTimeDeltaSeconds(click, conversion);

      expect(delta).toBe(0);
    });

    it("computes sample mean, standard deviation, median, min, and max correctly", () => {
      const data = [10, 20, 30, 40, 50];
      const stats = computeStatisticalMetrics(data);

      expect(stats.mean).toBe(30);
      expect(stats.median).toBe(30);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
      // Sample stdDev of [10, 20, 30, 40, 50] with n-1 = 4: sqrt(1000/4) = sqrt(250) ≈ 15.81
      expect(stats.stdDev).toBeCloseTo(15.81, 1);
    });

    it("handles even-length arrays when calculating median", () => {
      const data = [10, 20, 30, 40];
      const stats = computeStatisticalMetrics(data);

      expect(stats.median).toBe(25);
    });

    it("returns zero metrics for empty numerical arrays", () => {
      const stats = computeStatisticalMetrics([]);
      expect(stats.mean).toBe(0);
      expect(stats.stdDev).toBe(0);
      expect(stats.median).toBe(0);
    });

    it("calculates 1-minute bucket peak velocity and hourly rate accurately", () => {
      const base = new Date("2026-10-21T12:00:00Z").getTime();
      const records: ClickToConversionRecord[] = [];

      // 8 conversions in minute 0
      for (let i = 0; i < 8; i++) {
        records.push({
          id: `rec-0-${i}`,
          campaignId: "camp-1",
          campaignName: "Test Campaign",
          affiliateAddress: "GAFF_1",
          affiliateName: "Fast Partner",
          clickTimestamp: new Date(base + i * 1000).toISOString(),
          conversionTimestamp: new Date(base + 5000 + i * 1000).toISOString(),
          timeDeltaSeconds: 5,
          ipHash: "ip-1",
          subId: "sub-1",
          amount: 50,
          customerRef: `cust-${i}`,
        });
      }

      // 3 conversions in minute 1
      for (let i = 0; i < 3; i++) {
        records.push({
          id: `rec-1-${i}`,
          campaignId: "camp-1",
          campaignName: "Test Campaign",
          affiliateAddress: "GAFF_1",
          affiliateName: "Fast Partner",
          clickTimestamp: new Date(base + 65000 + i * 1000).toISOString(),
          conversionTimestamp: new Date(base + 70000 + i * 1000).toISOString(),
          timeDeltaSeconds: 5,
          ipHash: "ip-2",
          subId: "sub-1",
          amount: 50,
          customerRef: `cust-m1-${i}`,
        });
      }

      const { peakVelocityPerMinute, minuteBuckets } = calculateAffiliateVelocity(records);
      expect(peakVelocityPerMinute).toBe(8);
      expect(minuteBuckets.size).toBe(2);
    });
  });

  describe("2. Velocity Anomaly Detection (> 3 Standard Deviations above Campaign Mean)", () => {
    it("flags affiliate conversion velocity strictly when Z-score > 3.0", () => {
      const base = new Date("2026-10-21T12:00:00Z").getTime();
      const allRecords: ClickToConversionRecord[] = [];

      // Baseline affiliates with low velocity (1 - 2 conversions per minute)
      for (let aff = 1; aff <= 8; aff++) {
        const addr = `GAFF_BASELINE_${aff}`;
        for (let c = 0; c < 3; c++) {
          allRecords.push({
            id: `norm-${aff}-${c}`,
            campaignId: "camp-anomaly",
            campaignName: "Anomaly Test",
            affiliateAddress: addr,
            affiliateName: `Baseline ${aff}`,
            clickTimestamp: new Date(base + c * 30000).toISOString(),
            conversionTimestamp: new Date(base + 20000 + c * 30000).toISOString(),
            timeDeltaSeconds: 20,
            ipHash: `ip_norm_${aff}_${c}`,
            subId: "organic",
            amount: 50,
            customerRef: `cust-${aff}-${c}`,
          });
        }
      }

      // Extreme velocity anomaly affiliate: 50 conversions in 1 minute
      const botAddress = "GAFF_BOT_EXTREME";
      const botRecords: ClickToConversionRecord[] = [];
      for (let c = 0; c < 50; c++) {
        const rec: ClickToConversionRecord = {
          id: `bot-${c}`,
          campaignId: "camp-anomaly",
          campaignName: "Anomaly Test",
          affiliateAddress: botAddress,
          affiliateName: "Suspicious Bot Farm",
          clickTimestamp: new Date(base + c * 1000).toISOString(),
          conversionTimestamp: new Date(base + 800 + c * 1000).toISOString(),
          timeDeltaSeconds: 0.8,
          ipHash: "ip_identical_cluster_99",
          subId: "botnet_sub_x",
          amount: 100,
          customerRef: `cust-bot-${c}`,
        };
        botRecords.push(rec);
        allRecords.push(rec);
      }

      const botProfile = evaluateAffiliateRisk(botAddress, botRecords, allRecords);

      expect(botProfile.peakVelocityPerMinute).toBe(50);
      expect(botProfile.velocityZScore).toBeGreaterThan(3.0);
      expect(botProfile.isVelocityAnomaly).toBe(true);
      expect(botProfile.riskLevel).toBe("CRITICAL");
      expect(botProfile.riskScore).toBeGreaterThanOrEqual(80);

      // Verify risk factors contain the velocity anomaly
      const velocityFactor = botProfile.riskFactors.find(
        (f) => f.code === "BURST_VELOCITY_ANOMALY",
      );
      expect(velocityFactor).toBeDefined();
      expect(velocityFactor?.severity).toBe("CRITICAL");
      expect(velocityFactor?.description).toContain("standard deviations above campaign mean");
    });

    it("does not flag normal organic affiliates whose velocity is within 1-2 standard deviations", () => {
      const records = generateMockClickToConversionRecords();
      const aliceRecords = records.filter(
        (r) => r.affiliateAddress === "GAFFILIATE_ALICE_ORGANIC_01",
      );
      const profile = evaluateAffiliateRisk("GAFFILIATE_ALICE_ORGANIC_01", aliceRecords, records);

      expect(profile.isVelocityAnomaly).toBe(false);
      expect(profile.velocityZScore).toBeLessThan(3.0);
      expect(profile.riskLevel).toBe("LOW");
      expect(profile.riskScore).toBeLessThan(30);
    });
  });

  describe("3. Click-to-Conversion Time Delta & IP Hash Burst Analysis", () => {
    it("flags instant sub-second conversions (< 2.0s) as bot click injection", () => {
      const base = Date.now();
      const instantRecords: ClickToConversionRecord[] = Array.from({ length: 15 }, (_, i) => ({
        id: `inst-${i}`,
        campaignId: "camp-1",
        campaignName: "Test",
        affiliateAddress: "GAFF_INSTANT",
        affiliateName: "Instant Bot",
        clickTimestamp: new Date(base + i * 2000).toISOString(),
        conversionTimestamp: new Date(base + i * 2000 + 400).toISOString(), // 0.4s delta
        timeDeltaSeconds: 0.4,
        ipHash: `ip_inst_${i}`,
        subId: "click_injection",
        amount: 25,
        customerRef: `cust-inst-${i}`,
      }));

      const profile = evaluateAffiliateRisk("GAFF_INSTANT", instantRecords, instantRecords);

      expect(profile.medianTimeDeltaSeconds).toBe(0.4);
      expect(profile.minTimeDeltaSeconds).toBe(0.4);
      expect(profile.isInstantConversionAnomaly).toBe(true);

      const deltaFactor = profile.riskFactors.find((f) => f.code === "CLICK_DELTA_INSTANT");
      expect(deltaFactor).toBeDefined();
      expect(deltaFactor?.description).toContain("automated click injection");
    });

    it("flags rapid IP hash click bursts (50 conversions in 1 minute from the same IP hash)", () => {
      const base = new Date("2026-10-21T14:00:00Z").getTime();
      const ipBurstRecords: ClickToConversionRecord[] = Array.from({ length: 50 }, (_, i) => ({
        id: `burst-${i}`,
        campaignId: "camp-burst",
        campaignName: "Burst Test",
        affiliateAddress: "GAFF_IP_BURST",
        affiliateName: "IP Cluster Bot",
        clickTimestamp: new Date(base + i * 1000).toISOString(),
        conversionTimestamp: new Date(base + 2000 + i * 1000).toISOString(),
        timeDeltaSeconds: 2.0,
        ipHash: "ip_cloud_datacenter_proxy_01",
        subId: "same_sub_id",
        amount: 50,
        customerRef: `cust-burst-${i}`,
      }));

      const profile = evaluateAffiliateRisk("GAFF_IP_BURST", ipBurstRecords, ipBurstRecords);

      expect(profile.ipHashBurstCount).toBe(50);
      expect(profile.ipConcentrationRate).toBe(100);

      const ipFactor = profile.riskFactors.find((f) => f.code === "IP_HASH_CONCENTRATION");
      expect(ipFactor).toBeDefined();
      expect(ipFactor?.description).toContain("50 conversions logged within 1 minute");
      expect(profile.riskLevel).toBe("CRITICAL");
    });

    it("detects repetitive sub-ID patterns with high concentration", () => {
      const records = generateMockClickToConversionRecords();
      const rapidRecords = records.filter((r) => r.affiliateAddress === "GAFFILIATE_RAPID_HIGH_04");
      const profile = evaluateAffiliateRisk("GAFFILIATE_RAPID_HIGH_04", rapidRecords, records);

      expect(profile.repetitiveSubIdRate).toBe(100);
      expect(profile.topSubId).toBe("bot_popunder_aggressive");

      const subIdFactor = profile.riskFactors.find((f) => f.code === "REPETITIVE_SUB_ID");
      expect(subIdFactor).toBeDefined();
      expect(subIdFactor?.description).toContain("bot_popunder_aggressive");
    });
  });

  describe("4. Storage Persistence & 1-Click Freeze / Pause Mechanism", () => {
    it("persists paused affiliate records to local storage", () => {
      const targetAddress = "GAFFILIATE_FROZEN_01";
      expect(isAffiliatePaused(targetAddress)).toBe(false);

      const record = pauseAffiliate(
        targetAddress,
        "Extreme conversion velocity spike > 4σ",
        "Lead Advertiser",
        "Malicious Spammer",
        "camp-1",
      );

      expect(record.affiliateAddress).toBe(targetAddress);
      expect(record.reason).toContain("velocity spike");
      expect(isAffiliatePaused(targetAddress)).toBe(true);

      const stored = loadPausedAffiliates();
      expect(stored[targetAddress]).toBeDefined();
      expect(stored[targetAddress].pausedBy).toBe("Lead Advertiser");
    });
  });
});
