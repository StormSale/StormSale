import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildCampaignViewUrl,
  buildEscrowTopUpUrl,
  buildHighValueConversionPayload,
  buildLowEscrowAlertPayload,
} from "../lib/slackBlockKit";
import {
  DEFAULT_SLACK_CONFIG,
  SLACK_LOGS_STORAGE_KEY,
  SLACK_SETTINGS_STORAGE_KEY,
  clearSlackNotificationLogs,
  dispatchEscrowDepletionAlert,
  evaluateEscrowDepletion,
  getActiveSlackConfig,
  getSlackNotificationLogs,
  loadSlackConfig,
  maybeDispatchHighValueConversionAlert,
  normalizeSlackConfig,
  postSlackMessage,
  recordSlackNotificationLog,
  resetSlackNotifierStore,
  resetSlackRateLimiter,
  saveSlackConfig,
  testSlackWebhook,
  validateSlackWebhookUrl,
  watchCampaignEscrowLevels,
} from "../lib/slackNotifier";
import { triggerConversionPostback } from "../lib/webhookEngine";
import type { SlackIntegrationConfig, SlackWebhookPayload } from "../types/slack";

/** Dummy path segments only — never a live webhook (GitHub push protection flags real-looking ones). */
const WEBHOOK_URL =
  "https://hooks.slack.com/services/FAKE00000/FAKE00000/fake-webhook-path-segment";
const NOW_MS = 1_700_000_000_000;

const LOW_ESCROW_ALERT = {
  campaignId: "2",
  campaignName: "Web3 Masterclass",
  remainingXlm: 750,
  initialXlm: 10000,
  percentageRemaining: 7.5,
  thresholdPercent: 20,
};

function enabledConfig(overrides?: Partial<SlackIntegrationConfig>): SlackIntegrationConfig {
  return normalizeSlackConfig({
    ...DEFAULT_SLACK_CONFIG,
    isEnabled: true,
    webhookUrl: WEBHOOK_URL,
    ...overrides,
  });
}

function createSlackFetchMock(response?: { ok: boolean; status: number; body: string }) {
  const reply = {
    ok: response?.ok ?? true,
    status: response?.status ?? 200,
    statusText: response?.ok === false ? "Forbidden" : "OK",
    text: async () => response?.body ?? "ok",
  };
  return vi.fn(async (_url: string, _init: { method: string; body: string }) => reply);
}

type SlackFetchMock = ReturnType<typeof createSlackFetchMock>;

function asFetch(mock: SlackFetchMock): typeof fetch {
  return mock as unknown as typeof fetch;
}

function alertOptions(config: SlackIntegrationConfig, mock: SlackFetchMock, nowMs = NOW_MS) {
  return { config, nowMs, fetchImpl: asFetch(mock) };
}

function postedPayload(mock: SlackFetchMock): SlackWebhookPayload {
  const [, init] = mock.mock.calls[0];
  return JSON.parse(init.body);
}

let store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    store = {};
  },
};

describe("Slack Merchant Escrow Depletion Notifications (#204)", () => {
  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", mockLocalStorage);
    resetSlackNotifierStore();
    resetSlackRateLimiter();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("Slack integration settings", () => {
    it("falls back to documented defaults with a 20% escrow threshold", () => {
      expect(loadSlackConfig()).toEqual(DEFAULT_SLACK_CONFIG);
      expect(DEFAULT_SLACK_CONFIG.lowEscrowThresholdPercent).toBe(20);
      expect(DEFAULT_SLACK_CONFIG.isEnabled).toBe(false);
    });

    it("persists saved settings and reloads them", () => {
      const saved = saveSlackConfig({
        isEnabled: true,
        webhookUrl: WEBHOOK_URL,
        channelName: "#growth-war-room",
      });

      expect(JSON.parse(store[SLACK_SETTINGS_STORAGE_KEY]).channelName).toBe("#growth-war-room");
      expect(loadSlackConfig().webhookUrl).toBe(WEBHOOK_URL);
      expect(getActiveSlackConfig()).toEqual(saved);
    });

    it("clamps out-of-range thresholds, cooldowns and malformed numbers", () => {
      const normalized = normalizeSlackConfig({
        lowEscrowThresholdPercent: 400,
        cooldownSeconds: 1,
        maxNotificationsPerMinute: 900,
        highValueConversionXlm: Number("not-a-number"),
      });

      expect(normalized.lowEscrowThresholdPercent).toBe(99);
      expect(normalized.cooldownSeconds).toBe(30);
      expect(normalized.maxNotificationsPerMinute).toBe(60);
      expect(normalized.highValueConversionXlm).toBe(DEFAULT_SLACK_CONFIG.highValueConversionXlm);
    });

    it("keeps defaults when stored settings are corrupt", () => {
      store[SLACK_SETTINGS_STORAGE_KEY] = "{ broken json";
      expect(loadSlackConfig()).toEqual(DEFAULT_SLACK_CONFIG);
    });

    it("accepts only HTTPS Slack Incoming Webhook URLs", () => {
      expect(validateSlackWebhookUrl(WEBHOOK_URL).isValid).toBe(true);
      expect(validateSlackWebhookUrl("").isValid).toBe(false);

      const insecure = validateSlackWebhookUrl("http://hooks.slack.com/services/T1/B1/secret");
      expect(insecure.isValid).toBe(false);
      expect(insecure.reason).toContain("HTTPS");

      const foreign = validateSlackWebhookUrl("https://evil.example.com/services/T1/B1/secret");
      expect(foreign.isValid).toBe(false);
      expect(foreign.reason).toContain("hooks.slack.com");
    });
  });

  describe("Acceptance Criteria 1: test the webhook URL from settings", () => {
    it("posts a Block Kit test payload and logs the delivery", async () => {
      const mock = createSlackFetchMock();
      const result = await testSlackWebhook(WEBHOOK_URL, alertOptions(enabledConfig(), mock));

      expect(result.delivered).toBe(true);
      expect(result.log?.status).toBe("delivered");
      expect(result.log?.kind).toBe("ping.test");
      expect(result.log?.httpStatusCode).toBe(200);

      const posted = postedPayload(mock);
      expect(posted.blocks[0]).toEqual({
        type: "header",
        text: { type: "plain_text", text: "StormSale Webhook Test", emoji: true },
      });
    });

    it("logs a failure when Slack rejects the webhook", async () => {
      const mock = createSlackFetchMock({ ok: false, status: 403, body: "invalid_auth" });
      const result = await testSlackWebhook(WEBHOOK_URL, alertOptions(enabledConfig(), mock));

      expect(result.delivered).toBe(false);
      expect(result.log?.status).toBe("failed");
      expect(result.log?.httpStatusCode).toBe(403);
      expect(result.log?.error).toContain("invalid_auth");
    });

    it("refuses to send traffic to a non-Slack URL", async () => {
      const mock = createSlackFetchMock();
      const result = await testSlackWebhook("https://example.com/any-path", {
        ...alertOptions(enabledConfig(), mock),
        config: enabledConfig({ webhookUrl: "https://example.com/any-path" }),
      });

      expect(mock).not.toHaveBeenCalled();
      expect(result.delivered).toBe(false);
      expect(result.suppressedReason).toContain("hooks.slack.com");
    });

    it("posts the payload through the webhook transport", async () => {
      const mock = createSlackFetchMock();
      const outcome = await postSlackMessage(WEBHOOK_URL, buildEscrowAlertPayloadFixture(), {
        fetchImpl: asFetch(mock),
      });

      expect(outcome.ok).toBe(true);
      expect(outcome.responseBody).toBe("ok");
    });
  });

  describe("Acceptance Criteria 2: low escrow warning with action links", () => {
    it("flags campaigns under the 20% threshold and skips funded or completed ones", () => {
      const depleted = evaluateEscrowDepletion(
        {
          id: "7",
          name: "AI Coding Bootcamp",
          status: "Active",
          escrowInitial: 5000,
          escrowBalance: 900,
        },
        20,
      );
      expect(depleted.isDepleted).toBe(true);
      expect(depleted.percentageRemaining).toBe(18);

      const healthy = evaluateEscrowDepletion(
        { id: "8", name: "Solar Gear", status: "Active", escrowInitial: 5000, escrowBalance: 1500 },
        20,
      );
      expect(healthy.isDepleted).toBe(false);

      const completed = evaluateEscrowDepletion(
        { id: "9", name: "Old Drop", status: "Completed", escrowInitial: 5000, escrowBalance: 10 },
        20,
      );
      expect(completed.isDepleted).toBe(false);
    });

    it("builds a warning carrying View Campaign and Top Up Escrow buttons", () => {
      const payload = buildLowEscrowAlertPayload(
        { ...LOW_ESCROW_ALERT, campaignId: "camp_42" },
        { appBaseUrl: "https://stormsale.app", channel: "#merchant-alerts" },
      );

      expect(payload.channel).toBe("#merchant-alerts");
      expect(payload.text).toContain("Web3 Masterclass");

      const actions = payload.blocks.find((block) => block.type === "actions");
      const buttons = actions?.type === "actions" ? actions.elements : [];
      expect(buttons.map((button) => button.text.text)).toEqual(["View Campaign", "Top Up Escrow"]);
      expect(buttons[0].url).toBe(
        "https://stormsale.app/advertiser?tab=my-campaigns&campaignId=camp_42",
      );
      expect(buttons[1].url).toBe(
        "https://stormsale.app/advertiser?action=topup&campaignId=camp_42",
      );
      expect(buttons[1].style).toBe("primary");
    });

    it("builds absolute deep links for the campaign view and top-up flows", () => {
      expect(buildCampaignViewUrl("12", "https://shop.test/")).toBe(
        "https://shop.test/advertiser?tab=my-campaigns&campaignId=12",
      );
      expect(buildEscrowTopUpUrl("12", "https://shop.test")).toContain("action=topup");
      expect(buildEscrowTopUpUrl(undefined, "https://shop.test")).toBe(
        "https://shop.test/advertiser?action=topup",
      );
    });

    it("dispatches one alert per depleted campaign during a monitor sweep", async () => {
      const mock = createSlackFetchMock();
      const results = await watchCampaignEscrowLevels(
        [
          {
            id: "1",
            name: "Tech Gadgets Pro",
            status: "Active",
            escrowInitial: 5000,
            escrowBalance: 3250,
          },
          {
            id: "2",
            name: "Web3 Masterclass",
            status: "Active",
            escrowInitial: 10000,
            escrowBalance: 750,
          },
          {
            id: "4",
            name: "DeFi Starter Pack",
            status: "Completed",
            escrowInitial: 3000,
            escrowBalance: 100,
          },
        ],
        alertOptions(enabledConfig(), mock),
      );

      expect(results).toHaveLength(1);
      expect(results[0].delivered).toBe(true);
      expect(results[0].log?.kind).toBe("escrow.depletion");
      expect(mock).toHaveBeenCalledTimes(1);
      expect(getSlackNotificationLogs()[0].message).toContain("Web3 Masterclass");
    });

    it("stays silent while the integration is disabled", async () => {
      const mock = createSlackFetchMock();
      const config = enabledConfig({ isEnabled: false });

      const results = await watchCampaignEscrowLevels(
        [
          {
            id: "2",
            name: "Web3 Masterclass",
            status: "Active",
            escrowInitial: 10000,
            escrowBalance: 750,
          },
        ],
        alertOptions(config, mock),
      );
      expect(results).toHaveLength(0);

      const dispatch = await dispatchEscrowDepletionAlert(
        LOW_ESCROW_ALERT,
        alertOptions(config, mock),
      );
      expect(dispatch.log).toBeNull();
      expect(mock).not.toHaveBeenCalled();
    });
  });

  describe("Rate limiting against channel flooding", () => {
    it("suppresses a repeat alert for the same campaign inside the cooldown", async () => {
      const mock = createSlackFetchMock();
      const options = alertOptions(enabledConfig({ cooldownSeconds: 300 }), mock);

      const first = await dispatchEscrowDepletionAlert(LOW_ESCROW_ALERT, options);
      const second = await dispatchEscrowDepletionAlert(
        LOW_ESCROW_ALERT,
        alertOptions(enabledConfig({ cooldownSeconds: 300 }), mock, NOW_MS + 60_000),
      );

      expect(first.delivered).toBe(true);
      expect(second.delivered).toBe(false);
      expect(second.log?.status).toBe("rate_limited");
      expect(second.suppressedReason).toContain("Cooldown");
      expect(mock).toHaveBeenCalledTimes(1);
    });

    it("alerts again once the cooldown window has elapsed", async () => {
      const mock = createSlackFetchMock();
      const config = enabledConfig({ cooldownSeconds: 120 });

      await dispatchEscrowDepletionAlert(LOW_ESCROW_ALERT, alertOptions(config, mock));
      const recovered = await dispatchEscrowDepletionAlert(
        LOW_ESCROW_ALERT,
        alertOptions(config, mock, NOW_MS + 121_000),
      );

      expect(recovered.delivered).toBe(true);
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it("caps total messages inside the flood-guard window across campaigns", async () => {
      const mock = createSlackFetchMock();
      const config = enabledConfig({ cooldownSeconds: 30, maxNotificationsPerMinute: 2 });

      const alertFor = (campaignId: string, atMs: number) =>
        dispatchEscrowDepletionAlert(
          {
            ...LOW_ESCROW_ALERT,
            campaignId,
            campaignName: `Campaign ${campaignId}`,
            remainingXlm: 100,
            percentageRemaining: 2,
          },
          alertOptions(config, mock, atMs),
        );

      await alertFor("a", NOW_MS);
      await alertFor("b", NOW_MS);
      const suppressed = await alertFor("c", NOW_MS + 1_000);
      expect(suppressed.log?.status).toBe("rate_limited");
      expect(suppressed.suppressedReason).toContain("Flood guard");

      // Alerts for other campaigns clear the rolling window once it expires
      resetSlackRateLimiter();
      const afterWindow = await alertFor("c", NOW_MS + 61_000);
      expect(afterWindow.delivered).toBe(true);
      expect(mock).toHaveBeenCalledTimes(3);
    });

    it("resets a campaign cooldown when its escrow recovers", async () => {
      const mock = createSlackFetchMock();
      const config = enabledConfig({ cooldownSeconds: 300 });
      const depletedCampaign = {
        id: "2",
        name: "Web3 Masterclass",
        status: "Active" as const,
        escrowInitial: 10000,
        escrowBalance: 750,
      };

      await watchCampaignEscrowLevels([depletedCampaign], alertOptions(config, mock));
      await watchCampaignEscrowLevels(
        [depletedCampaign],
        alertOptions(config, mock, NOW_MS + 1_000),
      );
      expect(mock).toHaveBeenCalledTimes(1);

      // Top-up restores the budget, which frees the cooldown for the next dip
      await watchCampaignEscrowLevels(
        [{ ...depletedCampaign, escrowBalance: 9000 }],
        alertOptions(config, mock, NOW_MS + 2_000),
      );
      const afterTopUp = await watchCampaignEscrowLevels(
        [depletedCampaign],
        alertOptions(config, mock, NOW_MS + 3_000),
      );

      expect(afterTopUp[0].delivered).toBe(true);
      expect(mock).toHaveBeenCalledTimes(2);
    });
  });

  describe("High-value conversion alerts", () => {
    it("only alerts when the sale clears the configured threshold", async () => {
      const mock = createSlackFetchMock();
      const config = enabledConfig({ highValueConversionXlm: 1000, cooldownSeconds: 30 });

      expect(
        await maybeDispatchHighValueConversionAlert(saleData(250), alertOptions(config, mock)),
      ).toBeNull();
      expect(mock).not.toHaveBeenCalled();

      const alert = await maybeDispatchHighValueConversionAlert(
        saleData(2400),
        alertOptions(config, mock),
      );
      expect(alert?.delivered).toBe(true);
      expect(alert?.log?.kind).toBe("conversion.high_value");

      const actions = alert?.log?.payload?.blocks.find((block) => block.type === "actions");
      expect(actions?.type === "actions" ? actions.elements : []).toHaveLength(2);
    });

    it("formats the conversion message with amount and affiliate fields", () => {
      const payload = buildHighValueConversionPayload(
        {
          campaignId: "1",
          campaignName: "Tech Gadgets Pro",
          affiliateAddress: "GAFFILIATE777DEMO",
          amountXlm: 2400,
          stellarTxHash: "TX_HASH_1",
        },
        { appBaseUrl: "https://stormsale.app" },
      );

      expect(payload.text).toContain("2,400 XLM");
      const fields = payload.blocks.flatMap((block) =>
        block.type === "section" && block.fields ? block.fields : [],
      );
      expect(fields.map((field) => field.text).join(" ")).toContain("GAFFILIATE777DEMO");
    });

    it("is triggered by the automated conversion postback pipeline", async () => {
      saveSlackConfig(enabledConfig({ cooldownSeconds: 30, highValueConversionXlm: 1000 }));
      const fetchMock = vi.fn(async (_url: string, _init: { method: string; body: string }) => ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "ok",
      }));
      vi.stubGlobal("fetch", fetchMock);

      await triggerConversionPostback({
        saleId: "SALE_SLACK_1",
        campaignAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GAFFILIATE_TEST_WALLET",
        advertiserAddress: "GADVERTISER_TEST_WALLET",
        saleAmount: "3500.00",
        currency: "XLM",
        stellarTxHash: "TX_SLACK_1",
        ledgerTimestamp: new Date().toISOString(),
        status: "CONFIRMED_ON_LEDGER",
      });

      const slackPost = fetchMock.mock.calls.find(([url]) => url === WEBHOOK_URL);
      expect(slackPost).toBeDefined();
      expect(getSlackNotificationLogs().some((log) => log.kind === "conversion.high_value")).toBe(
        true,
      );
    });
  });

  describe("Acceptance Criteria 3: notification logs in advertiser settings", () => {
    it("records, persists and clears dispatch logs", async () => {
      const mock = createSlackFetchMock();
      await dispatchEscrowDepletionAlert(LOW_ESCROW_ALERT, alertOptions(enabledConfig(), mock));

      expect(getSlackNotificationLogs()).toHaveLength(1);
      expect(getSlackNotificationLogs()[0].payload?.blocks.length).toBeGreaterThan(0);
      expect(JSON.parse(store[SLACK_LOGS_STORAGE_KEY])).toHaveLength(1);

      clearSlackNotificationLogs();
      expect(getSlackNotificationLogs()).toHaveLength(0);
      expect(store[SLACK_LOGS_STORAGE_KEY]).toBeUndefined();
    });

    it("caps stored history at the most recent entries", () => {
      for (let i = 0; i < 105; i += 1) {
        recordSlackNotificationLog({
          kind: "escrow.depletion",
          status: "delivered",
          channel: "#merchant-alerts",
          message: `Alert ${i}`,
          httpStatusCode: 200,
        });
      }

      const logs = getSlackNotificationLogs();
      expect(logs).toHaveLength(100);
      expect(logs[0].message).toBe("Alert 104");
    });
  });
});

function saleData(amountXlm: number) {
  return {
    campaignName: "Tech Gadgets Pro",
    campaignId: "1",
    affiliateAddress: "GAFFILIATE777DEMO",
    amountXlm,
    stellarTxHash: "TX_HASH_1",
  };
}

function buildEscrowAlertPayloadFixture(): SlackWebhookPayload {
  return buildLowEscrowAlertPayload(
    { ...LOW_ESCROW_ALERT, campaignId: "1", remainingXlm: 500, percentageRemaining: 10 },
    { channel: "#merchant-alerts" },
  );
}
