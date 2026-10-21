/**
 * Fraud Risk Scoring Engine Based on Click-to-Conversion Anomaly Detection (#152)
 *
 * Implements:
 * 1. Click-to-conversion time delta distribution analysis (sub-second click injection detection)
 * 2. Statistical conversion velocity anomaly detection (Z-score > 3.0 above campaign mean)
 * 3. Rapid click burst detection from identical IP hashes (e.g. 50 conversions in 1 min)
 * 4. Repetitive sub-ID concentration detection
 * 5. Composite risk scoring (Low, Medium, High, Critical)
 * 6. 1-click advertiser pause/freeze persistence for affiliate payout blocking
 */

import type {
  ClickToConversionRecord,
  AffiliateRiskProfile,
  RiskScoreLevel,
  RiskFactor,
  PausedAffiliateRecord,
  CampaignAnomalySummary,
} from "../types/fraud";
import { getLocalStorage } from "./storage";

export const PAUSED_AFFILIATES_STORAGE_KEY = "stormsale.fraud.paused_affiliates";

/**
 * Calculates time delta in seconds between click and conversion.
 */
export function calculateTimeDeltaSeconds(
  clickTimestamp: string,
  conversionTimestamp: string,
): number {
  const click = new Date(clickTimestamp).getTime();
  const conv = new Date(conversionTimestamp).getTime();
  const diffMs = Math.max(0, conv - click);
  return Number((diffMs / 1000).toFixed(2));
}

/**
 * Computes statistical properties (mean, sample standard deviation, median, min, max)
 * from a list of numerical values.
 */
export function computeStatisticalMetrics(values: number[]): {
  mean: number;
  stdDev: number;
  median: number;
  min: number;
  max: number;
} {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, median: 0, min: 0, max: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;

  // Sample standard deviation (or 0 if single item)
  let variance = 0;
  if (sorted.length > 1) {
    const squaredDiffs = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
    variance = squaredDiffs / (sorted.length - 1);
  }
  const stdDev = Math.sqrt(variance);

  // Median
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    median: Number(median.toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
  };
}

/**
 * Calculates conversion velocities for an affiliate:
 * - Peak conversions per 1-minute sliding window
 * - Average conversions per hour
 */
export function calculateAffiliateVelocity(records: ClickToConversionRecord[]): {
  peakVelocityPerMinute: number;
  averageVelocityPerHour: number;
  minuteBuckets: Map<number, number>;
} {
  if (records.length === 0) {
    return { peakVelocityPerMinute: 0, averageVelocityPerHour: 0, minuteBuckets: new Map() };
  }

  const minuteBuckets = new Map<number, number>();
  let minTime = Infinity;
  let maxTime = -Infinity;

  records.forEach((r) => {
    const timeMs = new Date(r.conversionTimestamp).getTime();
    if (timeMs < minTime) minTime = timeMs;
    if (timeMs > maxTime) maxTime = timeMs;

    // 1-minute bucket (epoch ms / 60000)
    const bucket = Math.floor(timeMs / 60000);
    minuteBuckets.set(bucket, (minuteBuckets.get(bucket) || 0) + 1);
  });

  let peakVelocityPerMinute = 0;
  minuteBuckets.forEach((count) => {
    if (count > peakVelocityPerMinute) {
      peakVelocityPerMinute = count;
    }
  });

  const spanHours = Math.max(1, (maxTime - minTime) / 3600000);
  const averageVelocityPerHour = Number((records.length / spanHours).toFixed(1));

  return {
    peakVelocityPerMinute,
    averageVelocityPerHour,
    minuteBuckets,
  };
}

/**
 * Evaluates affiliate risk profile based on click-to-conversion metrics,
 * statistical velocity anomaly (Z > 3.0), IP bursts, and repetitive sub-IDs.
 */
export function evaluateAffiliateRisk(
  affiliateAddress: string,
  affiliateRecords: ClickToConversionRecord[],
  allCampaignRecords: ClickToConversionRecord[],
  pausedRecord?: PausedAffiliateRecord,
): AffiliateRiskProfile {
  const affiliateName = affiliateRecords[0]?.affiliateName || "Unknown Partner";
  const campaignId = affiliateRecords[0]?.campaignId || "all";
  const campaignName = affiliateRecords[0]?.campaignName || "Campaign";
  const totalConversions = affiliateRecords.length;

  if (totalConversions === 0) {
    return {
      affiliateAddress,
      affiliateName,
      campaignId,
      campaignName,
      totalConversions: 0,
      peakVelocityPerMinute: 0,
      averageVelocityPerHour: 0,
      campaignMeanVelocity: 0,
      velocityStdDev: 0,
      velocityZScore: 0,
      isVelocityAnomaly: false,
      medianTimeDeltaSeconds: 0,
      meanTimeDeltaSeconds: 0,
      minTimeDeltaSeconds: 0,
      instantConversionCount: 0,
      isInstantConversionAnomaly: false,
      ipHashBurstCount: 0,
      ipConcentrationRate: 0,
      repetitiveSubIdRate: 0,
      riskScore: 0,
      riskLevel: "LOW",
      riskFactors: [],
      isPaused: Boolean(pausedRecord),
      pausedAt: pausedRecord?.pausedAt,
      pausedBy: pausedRecord?.pausedBy,
      pauseReason: pausedRecord?.reason,
    };
  }

  // 1. Affiliate Velocity & Campaign-Wide Distribution Analysis
  const { peakVelocityPerMinute, averageVelocityPerHour } =
    calculateAffiliateVelocity(affiliateRecords);

  // Group all campaign conversions by affiliate to compute campaign velocity distribution
  const campaignAffiliateVelocities = new Map<string, number>();
  const campaignByAffiliate = new Map<string, ClickToConversionRecord[]>();

  allCampaignRecords.forEach((r) => {
    const list = campaignByAffiliate.get(r.affiliateAddress) || [];
    list.push(r);
    campaignByAffiliate.set(r.affiliateAddress, list);
  });

  campaignByAffiliate.forEach((records, addr) => {
    const { peakVelocityPerMinute: peak } = calculateAffiliateVelocity(records);
    campaignAffiliateVelocities.set(addr, peak);
  });

  const peerVelocities = Array.from(campaignAffiliateVelocities.entries())
    .filter(([addr]) => addr !== affiliateAddress)
    .map(([, v]) => v);

  const baselineValues =
    peerVelocities.length >= 2 ? peerVelocities : Array.from(campaignAffiliateVelocities.values());

  const stats = computeStatisticalMetrics(baselineValues);

  // Z-Score: (v - mean) / stdDev
  let velocityZScore = 0;
  if (stats.stdDev > 0) {
    velocityZScore = Number(((peakVelocityPerMinute - stats.mean) / stats.stdDev).toFixed(2));
  } else if (peakVelocityPerMinute > stats.mean) {
    // If stdDev is 0 (all peer affiliates same speed except this high one), handle delta
    const delta = peakVelocityPerMinute - stats.mean;
    velocityZScore = delta >= 10 ? 5.0 : Number((delta / 2).toFixed(2));
  }

  // Acceptance Criteria: Conversion velocity > 3 standard deviations above campaign mean
  const isVelocityAnomaly = velocityZScore > 3.0;

  // 2. Click-to-Conversion Time Delta Analysis
  const deltas = affiliateRecords.map((r) => r.timeDeltaSeconds);
  const deltaStats = computeStatisticalMetrics(deltas);
  const instantConversionCount = deltas.filter((d) => d < 2.0).length;

  // Anomaly if significant proportion is under 2.0s or median is sub-second
  const isInstantConversionAnomaly =
    instantConversionCount >= 3 &&
    (deltaStats.median < 3.0 ||
      deltaStats.min < 1.0 ||
      instantConversionCount / totalConversions > 0.4);

  // 3. IP Hash Burst & Concentration Analysis (e.g. 50 conversions in 1 minute from same IP hash)
  const ipCounts = new Map<string, number>();
  const ipMinuteBuckets = new Map<string, number>();

  affiliateRecords.forEach((r) => {
    const ip = r.ipHash || "unknown_ip";
    ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);

    const timeMs = new Date(r.conversionTimestamp).getTime();
    const bucket = Math.floor(timeMs / 60000);
    const key = `${ip}_${bucket}`;
    ipMinuteBuckets.set(key, (ipMinuteBuckets.get(key) || 0) + 1);
  });

  let ipHashBurstCount = 0;
  ipMinuteBuckets.forEach((count) => {
    if (count > ipHashBurstCount) {
      ipHashBurstCount = count;
    }
  });

  let topIpHash: string | undefined;
  let topIpCount = 0;
  ipCounts.forEach((count, ip) => {
    if (count > topIpCount) {
      topIpCount = count;
      topIpHash = ip;
    }
  });

  const ipConcentrationRate = Number(((topIpCount / totalConversions) * 100).toFixed(1));

  // 4. Repetitive Sub-ID Pattern Analysis
  const subIdCounts = new Map<string, number>();
  affiliateRecords.forEach((r) => {
    const sub = r.subId || "direct";
    subIdCounts.set(sub, (subIdCounts.get(sub) || 0) + 1);
  });

  let topSubId: string | undefined;
  let topSubIdCount = 0;
  subIdCounts.forEach((count, sub) => {
    if (count > topSubIdCount) {
      topSubIdCount = count;
      topSubId = sub;
    }
  });

  const repetitiveSubIdRate = Number(((topSubIdCount / totalConversions) * 100).toFixed(1));

  // 5. Risk Factors Compilation
  const riskFactors: RiskFactor[] = [];

  if (isVelocityAnomaly) {
    riskFactors.push({
      code: "BURST_VELOCITY_ANOMALY",
      title: "Conversion Velocity Spike (>3σ)",
      description: `Velocity of ${peakVelocityPerMinute} conv/min is ${velocityZScore} standard deviations above campaign mean (${stats.mean} conv/min).`,
      severity: "CRITICAL",
      value: `${velocityZScore}σ`,
    });
  } else if (velocityZScore > 2.0) {
    riskFactors.push({
      code: "BURST_VELOCITY_ANOMALY",
      title: "Elevated Conversion Velocity (>2σ)",
      description: `Peak conversion rate of ${peakVelocityPerMinute} conv/min exceeds campaign baseline (${stats.mean} conv/min).`,
      severity: "HIGH",
      value: `${velocityZScore}σ`,
    });
  }

  if (ipHashBurstCount >= 10) {
    const isCriticalBurst = ipHashBurstCount >= 25;
    riskFactors.push({
      code: "IP_HASH_CONCENTRATION",
      title: "Rapid IP Hash Click Burst",
      description: `${ipHashBurstCount} conversions logged within 1 minute from the same IP hash (${topIpHash?.slice(0, 10)}...).`,
      severity: isCriticalBurst ? "CRITICAL" : "HIGH",
      value: `${ipHashBurstCount} / min`,
    });
  } else if (ipConcentrationRate >= 70 && totalConversions >= 8) {
    riskFactors.push({
      code: "IP_HASH_CONCENTRATION",
      title: "High IP Hash Concentration",
      description: `${ipConcentrationRate}% of all conversions originate from a single IP hash (${topIpHash?.slice(0, 10)}...).`,
      severity: "MEDIUM",
      value: `${ipConcentrationRate}%`,
    });
  }

  if (isInstantConversionAnomaly) {
    riskFactors.push({
      code: "CLICK_DELTA_INSTANT",
      title: "Rapid Click-to-Conversion (<2s)",
      description: `Median time from click to purchase is ${deltaStats.median}s with ${instantConversionCount} instant conversions (automated click injection suspected).`,
      severity: deltaStats.median < 1.0 ? "CRITICAL" : "HIGH",
      value: `${deltaStats.median}s`,
    });
  }

  if (repetitiveSubIdRate >= 75 && totalConversions >= 10) {
    riskFactors.push({
      code: "REPETITIVE_SUB_ID",
      title: "Repetitive Sub-ID Traffic",
      description: `${repetitiveSubIdRate}% of conversions share the identical sub-ID '${topSubId}'.`,
      severity: "MEDIUM",
      value: `${repetitiveSubIdRate}%`,
    });
  }

  // 6. Composite Risk Scoring (0 - 100)
  let riskScore = 0;

  // Velocity contributions
  if (isVelocityAnomaly) {
    riskScore += 50;
  } else if (velocityZScore > 2.0) {
    riskScore += 30;
  } else if (velocityZScore > 1.0) {
    riskScore += 15;
  }

  // IP concentration & burst contributions
  if (ipHashBurstCount >= 25) {
    riskScore += 40;
  } else if (ipHashBurstCount >= 10) {
    riskScore += 25;
  } else if (ipConcentrationRate >= 70 && totalConversions >= 8) {
    riskScore += 15;
  }

  // Click delta contributions
  if (isInstantConversionAnomaly) {
    riskScore += deltaStats.median < 1.0 ? 30 : 20;
  } else if (deltaStats.median < 5.0 && totalConversions >= 5) {
    riskScore += 10;
  }

  // Sub-ID repetition contribution
  if (repetitiveSubIdRate >= 75 && totalConversions >= 10) {
    riskScore += 15;
  }

  // Clamp risk score to [0, 100]
  riskScore = Math.min(100, Math.max(0, riskScore));

  // Determine categorical Risk Level
  let riskLevel: RiskScoreLevel;
  if (riskScore >= 80 || isVelocityAnomaly || ipHashBurstCount >= 25) {
    riskLevel = "CRITICAL";
    riskScore = Math.max(riskScore, 85);
  } else if (riskScore >= 60) {
    riskLevel = "HIGH";
  } else if (riskScore >= 30) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "LOW";
  }

  return {
    affiliateAddress,
    affiliateName,
    campaignId,
    campaignName,
    totalConversions,
    peakVelocityPerMinute,
    averageVelocityPerHour,
    campaignMeanVelocity: stats.mean,
    velocityStdDev: stats.stdDev,
    velocityZScore,
    isVelocityAnomaly,
    medianTimeDeltaSeconds: deltaStats.median,
    meanTimeDeltaSeconds: deltaStats.mean,
    minTimeDeltaSeconds: deltaStats.min,
    instantConversionCount,
    isInstantConversionAnomaly,
    ipHashBurstCount,
    ipConcentrationRate,
    topIpHash,
    repetitiveSubIdRate,
    topSubId,
    riskScore,
    riskLevel,
    riskFactors,
    isPaused: Boolean(pausedRecord),
    pausedAt: pausedRecord?.pausedAt,
    pausedBy: pausedRecord?.pausedBy,
    pauseReason: pausedRecord?.reason,
  };
}

/**
 * Calculates risk profiles for all unique affiliates across a conversion stream.
 */
export function calculateAllAffiliateRiskProfiles(
  records: ClickToConversionRecord[],
  pausedAffiliatesMap: Record<string, PausedAffiliateRecord> = {},
): Record<string, AffiliateRiskProfile> {
  const byAffiliate = new Map<string, ClickToConversionRecord[]>();

  records.forEach((r) => {
    const list = byAffiliate.get(r.affiliateAddress) || [];
    list.push(r);
    byAffiliate.set(r.affiliateAddress, list);
  });

  const profiles: Record<string, AffiliateRiskProfile> = {};

  byAffiliate.forEach((affiliateRecords, address) => {
    profiles[address] = evaluateAffiliateRisk(
      address,
      affiliateRecords,
      records,
      pausedAffiliatesMap[address],
    );
  });

  return profiles;
}

/**
 * Summarizes campaign anomaly and fraud detection stats.
 */
export function summarizeCampaignAnomalies(
  profiles: Record<string, AffiliateRiskProfile>,
  campaignId: string = "all",
): CampaignAnomalySummary {
  const profileList = Object.values(profiles);
  const filtered =
    campaignId === "all" ? profileList : profileList.filter((p) => p.campaignId === campaignId);

  const velocities = filtered.map((p) => p.peakVelocityPerMinute);
  const stats = computeStatisticalMetrics(velocities);

  const flaggedAnomaliesCount = filtered.filter((p) => p.isVelocityAnomaly).length;
  const criticalAffiliatesCount = filtered.filter((p) => p.riskLevel === "CRITICAL").length;
  const frozenAffiliatesCount = filtered.filter((p) => p.isPaused).length;

  return {
    campaignId,
    totalAffiliates: filtered.length,
    meanVelocity: stats.mean,
    velocityStdDev: stats.stdDev,
    flaggedAnomaliesCount,
    criticalAffiliatesCount,
    frozenAffiliatesCount,
  };
}

// ---------------------------------------------------------------------------
// Storage Management for Paused / Frozen Affiliates
// ---------------------------------------------------------------------------

/**
 * Loads paused affiliate records from local storage.
 */
export function loadPausedAffiliates(): Record<string, PausedAffiliateRecord> {
  const storage = getLocalStorage();
  try {
    const raw = storage.getItem(PAUSED_AFFILIATES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Persists paused affiliate records to local storage.
 */
export function savePausedAffiliates(paused: Record<string, PausedAffiliateRecord>): void {
  const storage = getLocalStorage();
  try {
    storage.setItem(PAUSED_AFFILIATES_STORAGE_KEY, JSON.stringify(paused));
  } catch (err) {
    console.error("Failed to save paused affiliates to storage:", err);
  }
}

/**
 * Checks whether an affiliate is currently paused/frozen from claiming payouts.
 */
export function isAffiliatePaused(affiliateAddress: string): boolean {
  if (!affiliateAddress) return false;
  const paused = loadPausedAffiliates();
  return Boolean(paused[affiliateAddress]);
}

/**
 * Pauses an affiliate, freezing them from claiming commission payouts pending review.
 */
export function pauseAffiliate(
  affiliateAddress: string,
  reason: string = "Conversion velocity anomaly & fraud risk review",
  pausedBy: string = "Advertiser Admin",
  affiliateName?: string,
  campaignId?: string,
): PausedAffiliateRecord {
  const paused = loadPausedAffiliates();
  const record: PausedAffiliateRecord = {
    affiliateAddress,
    affiliateName,
    campaignId,
    pausedAt: new Date().toISOString(),
    pausedBy,
    reason,
  };
  paused[affiliateAddress] = record;
  savePausedAffiliates(paused);
  return record;
}

/**
 * Unpauses an affiliate, restoring payout claim capabilities.
 */
export function unpauseAffiliate(affiliateAddress: string): boolean {
  const paused = loadPausedAffiliates();
  if (!paused[affiliateAddress]) return false;
  delete paused[affiliateAddress];
  savePausedAffiliates(paused);
  return true;
}

// ---------------------------------------------------------------------------
// Realistic Mock Data Generator with Normal & Suspicious Click/Conversion Records
// ---------------------------------------------------------------------------

/**
 * Generates sample click-to-conversion records demonstrating:
 * 1. Clean organic affiliates (Alice, Bob) with realistic human time deltas (>30s)
 * 2. An affiliate with moderate velocity
 * 3. A high-risk affiliate with repetitive sub-IDs and fast checkouts
 * 4. A critical fraud bot affiliate with 50 conversions in 1 minute from the same IP hash and <1s click delta!
 */
export function generateMockClickToConversionRecords(
  campaignId: string = "camp-1",
  campaignName: string = "Tech Gadgets Pro",
): ClickToConversionRecord[] {
  const records: ClickToConversionRecord[] = [];
  const baseTime = Date.now() - 3600000; // 1 hour ago

  // 1. Organic Affiliate: Alice Partner (Clean, normal human deltas ~45s - 120s, varied IPs)
  const aliceAddress = "GAFFILIATE_ALICE_ORGANIC_01";
  for (let i = 1; i <= 15; i++) {
    const clickMs = baseTime + i * 180000; // Every ~3 mins
    const deltaSec = 35 + (i % 7) * 12; // 35s - 107s
    const convMs = clickMs + deltaSec * 1000;

    records.push({
      id: `TX_ALICE_${i}`,
      campaignId,
      campaignName,
      affiliateAddress: aliceAddress,
      affiliateName: "Alice Partner",
      clickTimestamp: new Date(clickMs).toISOString(),
      conversionTimestamp: new Date(convMs).toISOString(),
      timeDeltaSeconds: deltaSec,
      ipHash: `ip_hash_alice_${i % 12}`,
      subId: `organic_seo_${i % 4}`,
      amount: 85 + (i % 5) * 10,
      customerRef: `CUST_ALICE_${i}`,
    });
  }

  // 2. Organic Affiliate: Bob Partner (Clean, deltas ~50s - 180s)
  const bobAddress = "GAFFILIATE_BOB_ORGANIC_02";
  for (let i = 1; i <= 12; i++) {
    const clickMs = baseTime + i * 240000;
    const deltaSec = 45 + (i % 6) * 15;
    const convMs = clickMs + deltaSec * 1000;

    records.push({
      id: `TX_BOB_${i}`,
      campaignId,
      campaignName,
      affiliateAddress: bobAddress,
      affiliateName: "Bob Partner",
      clickTimestamp: new Date(clickMs).toISOString(),
      conversionTimestamp: new Date(convMs).toISOString(),
      timeDeltaSeconds: deltaSec,
      ipHash: `ip_hash_bob_${i % 10}`,
      subId: `newsletter_promo_${i % 3}`,
      amount: 60 + (i % 4) * 20,
      customerRef: `CUST_BOB_${i}`,
    });
  }

  // 3. Moderate Risk Affiliate: Charlie Media (Slightly elevated velocity, deltas ~18s - 35s)
  const charlieAddress = "GAFFILIATE_CHARLIE_MED_03";
  for (let i = 1; i <= 18; i++) {
    const clickMs = baseTime + 1200000 + i * 60000;
    const deltaSec = 18 + (i % 5) * 4;
    const convMs = clickMs + deltaSec * 1000;

    records.push({
      id: `TX_CHARLIE_${i}`,
      campaignId,
      campaignName,
      affiliateAddress: charlieAddress,
      affiliateName: "Charlie Media",
      clickTimestamp: new Date(clickMs).toISOString(),
      conversionTimestamp: new Date(convMs).toISOString(),
      timeDeltaSeconds: deltaSec,
      ipHash: `ip_hash_charlie_${i % 6}`,
      subId: `adwords_campaign_${i % 2}`,
      amount: 45 + (i % 3) * 15,
      customerRef: `CUST_CHARLIE_${i}`,
    });
  }

  // 4. High Risk Affiliate: RapidClick Network (Fast deltas ~2.5s - 6s, 80% same sub-ID)
  const rapidAddress = "GAFFILIATE_RAPID_HIGH_04";
  for (let i = 1; i <= 22; i++) {
    const clickMs = baseTime + 2000000 + i * 30000;
    const deltaSec = 2.5 + (i % 4) * 0.8; // Fast
    const convMs = clickMs + deltaSec * 1000;

    records.push({
      id: `TX_RAPID_${i}`,
      campaignId,
      campaignName,
      affiliateAddress: rapidAddress,
      affiliateName: "RapidClick Network",
      clickTimestamp: new Date(clickMs).toISOString(),
      conversionTimestamp: new Date(convMs).toISOString(),
      timeDeltaSeconds: deltaSec,
      ipHash: `ip_hash_rapid_${i % 4}`,
      subId: "bot_popunder_aggressive",
      amount: 40 + (i % 2) * 20,
      customerRef: `CUST_RAPID_${i}`,
    });
  }

  // 5. Critical Bot Farm Affiliate: BotSpam_Farm_99
  // As described in User Story: "50 conversions in 1 minute from the same IP hash", sub-second delta (<1s)
  const botAddress = "GAFFILIATE_BOTSPAM_CRITICAL_99";
  const burstMinuteMs = baseTime + 2800000; // Single 1-minute window
  const identicalIpHash = "ip_hash_cloud_botnet_cluster_442";

  for (let i = 1; i <= 50; i++) {
    // 50 conversions staggered within 60,000ms
    const offsetMs = (i - 1) * 1100; // Every 1.1 seconds
    const clickMs = burstMinuteMs + offsetMs;
    const deltaSec = 0.4 + (i % 5) * 0.1; // 0.4s - 0.8s (Automated click injection)
    const convMs = clickMs + deltaSec * 1000;

    records.push({
      id: `TX_BOT_${i}`,
      campaignId,
      campaignName,
      affiliateAddress: botAddress,
      affiliateName: "Suspicious Traffic BotFarm-99",
      clickTimestamp: new Date(clickMs).toISOString(),
      conversionTimestamp: new Date(convMs).toISOString(),
      timeDeltaSeconds: deltaSec,
      ipHash: identicalIpHash, // All from identical IP hash
      subId: "botnet_spoofed_sub_99",
      amount: 110,
      customerRef: `CUST_BOT_INJECTED_${i}`,
    });
  }

  return records;
}
