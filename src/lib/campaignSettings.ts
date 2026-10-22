/**
 * Extended Campaign Parameters Store (#151, #155, #156)
 *
 * The deployed Soroban escrow contract's `create_campaign` entry point takes
 * (address, rate, clearing period, budget). The new advertiser product knobs —
 * attribution model/window, A/B landing variant split, and the optional
 * `daily_payout_cap` — are anchored to the campaign id and persisted here so
 * the sale-logging, redirect routing, and claim flows resolve consistent
 * per-campaign rules. Mirrors the localStorage conventions of lib/branding.ts.
 */

import type { AttributionSettings } from "./attribution";
import { normalizeAttributionSettings } from "./attribution";
import type { LandingSplitSettings } from "./abTesting";
import { DEFAULT_LANDING_SPLIT } from "./abTesting";
import { validateDailyPayoutCap } from "./payoutCap";

const SETTINGS_KEY_PREFIX = "stormsale_campaign_settings_v1_";

export interface ExtendedCampaignSettings {
  campaignId: number;
  campaignName: string;
  attribution: AttributionSettings;
  /** null = unlimited daily claiming for each affiliate */
  dailyPayoutCapXlm: number | null;
  landingSplit: LandingSplitSettings;
  createdAt: number;
  updatedAt: number;
}

/** Raw input captured by the campaign creation form before normalization. */
export interface CampaignSettingsInput {
  campaignName: string;
  attributionModel?: AttributionSettings["model"];
  attributionWindowDays?: number;
  dailyPayoutCapInput?: string;
  landingSplit?: LandingSplitSettings;
}

export function defaultExtendedSettings(
  campaignId: number,
  campaignName: string,
): ExtendedCampaignSettings {
  return {
    campaignId,
    campaignName,
    attribution: normalizeAttributionSettings(),
    dailyPayoutCapXlm: null,
    landingSplit: {
      ...DEFAULT_LANDING_SPLIT,
      variants: DEFAULT_LANDING_SPLIT.variants.map((v) => ({ ...v })),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Normalizes form input into durable campaign settings, validating the
 * attribution window, payout cap, and landing split in one place.
 */
export function buildCampaignSettings(
  campaignId: number,
  input: CampaignSettingsInput,
): ExtendedCampaignSettings {
  const capResult = validateDailyPayoutCap(input.dailyPayoutCapInput);
  return {
    campaignId,
    campaignName: input.campaignName,
    attribution: normalizeAttributionSettings({
      model: input.attributionModel,
      windowDays: input.attributionWindowDays,
    }),
    dailyPayoutCapXlm: capResult.valid ? capResult.capXlm : null,
    landingSplit: input.landingSplit
      ? {
          enabled: input.landingSplit.enabled,
          variants: input.landingSplit.variants.map((v) => ({ ...v })),
        }
      : defaultExtendedSettings(campaignId, input.campaignName).landingSplit,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function saveCampaignSettings(settings: ExtendedCampaignSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${SETTINGS_KEY_PREFIX}${settings.campaignId}`, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings degrade to contract defaults downstream
  }
}

export function loadCampaignSettings(campaignId: number): ExtendedCampaignSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${SETTINGS_KEY_PREFIX}${campaignId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.campaignId !== "number") return null;
    return {
      ...defaultExtendedSettings(campaignId, String(parsed.campaignName || "")),
      ...parsed,
      attribution: normalizeAttributionSettings(parsed.attribution),
    } as ExtendedCampaignSettings;
  } catch {
    return null;
  }
}

/**
 * Extracts a numeric campaign id from the free-form campaign identifiers used
 * across the advertiser forms (e.g. "Campaign #1234", "1234", or a raw id).
 *
 * Anchored on purpose: a Soroban contract ID (`C…`) or Stellar public key (`G…`)
 * is base-32 and routinely contains digit runs, so an unanchored "first digits
 * anywhere" match silently resolved `CAB3…` to campaign `3` and applied an
 * unrelated campaign's attribution rules. Anything that is not a bare numeric id
 * or the `Campaign #N` form now returns `null`.
 */
export function parseCampaignId(identifier: string): number | null {
  if (!identifier) return null;
  const match = identifier.trim().match(/^(?:campaign\s*)?#?(\d{1,9})$/i);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return Number.isFinite(id) ? id : null;
}

/**
 * Resolves which campaign's persisted settings must gate an operation from the
 * numeric campaign id the advertiser entered explicitly.
 *
 * `create_campaign` returns a `u64` id inside the shared platform contract —
 * there is no per-campaign contract address — and settings are keyed by that
 * number (`stormsale_campaign_settings_v1_<campaignId>`), so an address can never
 * be used to look settings up. Accepts only a bare positive integer id.
 *
 * Returns `null` for missing/invalid input, which callers treat as "no settings
 * record": the sale still logs without the attribution gate, exactly as before,
 * because an absent client-side settings store must never block a ledger sale.
 */
export function resolveSettingsCampaignId(campaignIdInput: string | undefined): number | null {
  if (!campaignIdInput) return null;
  const trimmed = campaignIdInput.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number(trimmed);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
