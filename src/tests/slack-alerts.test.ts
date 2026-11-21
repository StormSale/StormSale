// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOW_ESCROW_THRESHOLD_PERCENT,
  SLACK_LOG_LIMIT,
  SLACK_LOGS_STORAGE_KEY,
  SLACK_MAX_ALERTS_PER_MINUTE,
  SLACK_SETTINGS_STORAGE_KEY,
  appendSlackNotificationLog,
  buildCampaignUrl,
  buildHighValueConversionBlocks,
  buildLowEscrowBlocks,
  buildSlackAlertMessage,
  clearSlackNotificationLogs,
  dispatchHighValueConversionAlert,
  dispatchLowEscrowAlert,
  getSlackNotificationLogs,
  isSlackAlertThrottled,
  isValidSlackWebhookUrl,
  loadSlackSettings,
  normalizeSlackAlert,
  normalizeSlackSettings,
  recordSlackAlert,
  remainingEscrowPercent,
  resetSlackRateLimit,
  resolveAppBaseUrl,
  saveSlackSettings,
  sendSlackAlert,
  sendSlackTestNotification,
  slackAlertThrottleKey,
  validateSlackWebhook,
  type SlackAlert,
  type SlackNotificationLog,
} from "../lib/slackAlerts";

const WEBHOOK = "https://hooks.slack.com/services/T000/B000/abc123";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

const alert: SlackAlert = {
  kind: "low-escrow",
  campaignId: "42",
  campaignName: "Tech Gadgets",
  currentBalanceXlm: 75,
  initialBudgetXlm: 1000,
  remainingPercent: 7.5,
  thresholdPercent: 20,
  appUrl: "https://app.stormsale.io",
};

beforeEach(() => {
  localStorage.clear();
  resetSlackRateLimit();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Slack webhook validation and settings", () => {
  it("accepts only https hooks.slack.com service URLs", () => {
    expect(isValidSlackWebhookUrl(WEBHOOK)).toBe(true);
    expect(isValidSlackWebhookUrl("http://hooks.slack.com/services/T/B/C")).toBe(false);
    expect(isValidSlackWebhookUrl("https://evil.example/services/T/B/C")).toBe(false);
    expect(isValidSlackWebhookUrl("https://hooks.slack.com/services/T/B")).toBe(false);
    expect(isValidSlackWebhookUrl("https://user:pass@hooks.slack.com/services/T/B/C")).toBe(false);
    expect(isValidSlackWebhookUrl(42)).toBe(false);
    expect(isValidSlackWebhookUrl("not a url")).toBe(false);
    expect(validateSlackWebhook(" ")).toContain("required");
    expect(validateSlackWebhook("https://example.com")).toContain("hooks.slack.com");
    expect(validateSlackWebhook(WEBHOOK)).toBeNull();
  });

  it("normalizes malformed settings and clamps the low-escrow threshold", () => {
    const normalized = normalizeSlackSettings({
      webhookUrl: ` ${WEBHOOK} `,
      enabled: false,
      highValueThresholdXlm: 250,
      lowEscrowThresholdPercent: 90,
    });
    expect(normalized).toEqual({
      webhookUrl: WEBHOOK,
      enabled: false,
      highValueThresholdXlm: 250,
      lowEscrowThresholdPercent: LOW_ESCROW_THRESHOLD_PERCENT,
    });

    const defaults = normalizeSlackSettings(null);
    expect(defaults.enabled).toBe(true);
    expect(defaults.highValueThresholdXlm).toBeGreaterThan(0);
    expect(defaults.lowEscrowThresholdPercent).toBe(LOW_ESCROW_THRESHOLD_PERCENT);
    expect(
      normalizeSlackSettings({ highValueThresholdXlm: -5, lowEscrowThresholdPercent: 0 }),
    ).toMatchObject({
      highValueThresholdXlm: 1000,
      lowEscrowThresholdPercent: LOW_ESCROW_THRESHOLD_PERCENT,
    });
  });

  it("round-trips settings and survives corrupt storage", () => {
    expect(loadSlackSettings().webhookUrl).toBe("");
    saveSlackSettings({
      webhookUrl: WEBHOOK,
      enabled: true,
      highValueThresholdXlm: 500,
      lowEscrowThresholdPercent: 10,
    });
    expect(loadSlackSettings()).toMatchObject({
      webhookUrl: WEBHOOK,
      highValueThresholdXlm: 500,
      lowEscrowThresholdPercent: 10,
    });
    expect(JSON.parse(localStorage.getItem(SLACK_SETTINGS_STORAGE_KEY)!)).toMatchObject({
      webhookUrl: WEBHOOK,
    });

    localStorage.setItem(SLACK_SETTINGS_STORAGE_KEY, "{broken");
    expect(loadSlackSettings().webhookUrl).toBe("");
  });
});

describe("Slack notification logs", () => {
  const log = (id: string): SlackNotificationLog => ({
    id,
    kind: "test",
    campaignId: "1",
    status: "sent",
    message: "ok",
    createdAt: new Date().toISOString(),
  });

  it("keeps newest logs first, caps the list, and clears", () => {
    for (let i = 0; i < SLACK_LOG_LIMIT + 5; i++) appendSlackNotificationLog(log(`log-${i}`));
    const logs = getSlackNotificationLogs();
    expect(logs).toHaveLength(SLACK_LOG_LIMIT);
    expect(logs[0].id).toBe(`log-${SLACK_LOG_LIMIT + 4}`);

    clearSlackNotificationLogs();
    expect(getSlackNotificationLogs()).toEqual([]);
  });

  it("sanitizes stored logs with unknown fields", () => {
    localStorage.setItem(
      SLACK_LOGS_STORAGE_KEY,
      JSON.stringify([
        { id: "x", kind: "nope", campaignId: "", status: "weird", message: "", createdAt: 5 },
        null,
        "bad",
      ]),
    );
    const [entry] = getSlackNotificationLogs();
    expect(entry).toMatchObject({
      id: "x",
      kind: "test",
      campaignId: "unknown",
      status: "failed",
    });
    expect(typeof entry.createdAt).toBe("string");
  });

  it("returns [] for corrupt log storage", () => {
    localStorage.setItem(SLACK_LOGS_STORAGE_KEY, "not-json");
    expect(getSlackNotificationLogs()).toEqual([]);
  });
});

describe("Slack throttling", () => {
  it("throttles the same campaign for the cooldown window and then releases it", () => {
    const key = slackAlertThrottleKey(alert);
    expect(key).toBe("low:42");
    expect(isSlackAlertThrottled(key, 1_000)).toBe(false);
    recordSlackAlert(key, 1_000);
    expect(isSlackAlertThrottled(key, 2_000)).toBe(true);
    expect(isSlackAlertThrottled(key, 1_000 + 5 * 60 * 1000 + 1)).toBe(false);
  });

  it("keys conversion alerts by transaction and test alerts by campaign", () => {
    expect(
      slackAlertThrottleKey({
        kind: "high-value-conversion",
        campaignId: "1",
        txHash: "abc",
      }),
    ).toBe("conversion:abc");
    expect(slackAlertThrottleKey({ kind: "test", campaignId: "1" })).toBe("test:1");
  });

  it("stops after the per-minute burst limit even for different keys", () => {
    for (let i = 0; i < SLACK_MAX_ALERTS_PER_MINUTE; i++) {
      recordSlackAlert(`key-${i}`, 10_000 + i);
    }
    expect(isSlackAlertThrottled("fresh", 11_000)).toBe(true);
    expect(isSlackAlertThrottled("fresh", 10_000 + 60_001)).toBe(false);
  });
});

describe("Slack Block Kit messages", () => {
  it("builds action buttons that deep link into the advertiser dashboard", () => {
    const blocks = buildLowEscrowBlocks(alert);
    expect(blocks[0]).toMatchObject({ type: "header" });
    const actions = blocks.find((block) => block.type === "actions") as unknown as {
      elements: Array<{ text: { text: string }; url: string }>;
    };
    expect(actions.elements.map((element) => element.text.text)).toEqual([
      "View Campaign",
      "Top Up Escrow",
    ]);
    expect(actions.elements[0].url).toContain("campaign=42");
    expect(actions.elements[1].url).toContain("action=top-up");

    const message = buildSlackAlertMessage(alert);
    expect(message.text).toContain("Tech Gadgets");
    expect(message.text).toContain("7.5%");
  });

  it("builds a high-value conversion message and a test message", () => {
    const conversion = buildHighValueConversionBlocks({
      kind: "high-value-conversion",
      campaignId: "7",
      campaignName: "Summit",
      saleAmountXlm: 2500,
      affiliateAddress: "GAFFILIATE",
      txHash: "deadbeef",
    });
    expect(JSON.stringify(conversion)).toContain("2,500 XLM");
    expect(JSON.stringify(conversion)).toContain("GAFFILIATE");

    const testMessage = buildSlackAlertMessage({ kind: "test", campaignId: "test" });
    expect(testMessage.text).toContain("connected");
    expect(testMessage.blocks[0]).toMatchObject({ type: "header" });
  });

  it("supports translated action labels", () => {
    const blocks = buildLowEscrowBlocks(alert, {
      viewCampaign: "Ver campaña",
      topUpEscrow: "Recargar",
      lowEscrowHeader: "Escrow bajo",
      highValueHeader: "Conversión",
      testHeader: "Prueba",
    });
    const actions = blocks.find((block) => block.type === "actions") as unknown as {
      elements: Array<{ text: { text: string } }>;
    };
    expect(actions.elements[0].text.text).toBe("Ver campaña");
    expect(JSON.stringify(blocks)).toContain("Escrow bajo");
  });

  it("normalizes unknown alert payloads and resolves safe URLs", () => {
    expect(normalizeSlackAlert(null)).toBeNull();
    expect(normalizeSlackAlert({ kind: "unknown", campaignId: "1" })).toBeNull();
    expect(normalizeSlackAlert({ kind: "low-escrow" })).toBeNull();
    expect(normalizeSlackAlert({ kind: "test" })).toMatchObject({ campaignId: "test" });
    expect(
      normalizeSlackAlert({
        kind: "low-escrow",
        campaignId: 42,
        remainingPercent: "7.5",
        appUrl: "https://app.example",
      }),
    ).toMatchObject({ campaignId: "42", remainingPercent: 7.5 });

    expect(resolveAppBaseUrl("https://app.stormsale.io/path")).toBe("https://app.stormsale.io");
    expect(resolveAppBaseUrl("not a url")).toBe("https://stormsale.app");
    expect(buildCampaignUrl("42", "top-up", "https://app.stormsale.io")).toBe(
      "https://app.stormsale.io/?page=advertiser&tab=my-campaigns&campaign=42&action=top-up",
    );
    expect(remainingEscrowPercent(75, 1000)).toBe(7.5);
    expect(remainingEscrowPercent(10, 0)).toBe(0);
  });
});

describe("Sending Slack alerts", () => {
  it("rejects invalid webhook URLs without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await sendSlackAlert("https://example.com", alert, { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");
    expect(getSlackNotificationLogs()[0].status).toBe("failed");
  });

  it("posts through the proxy and records a sent log", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const result = await sendSlackAlert(WEBHOOK, alert, { fetchImpl, force: true });
    expect(result.status).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/slack/notify",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.webhookUrl).toBe(WEBHOOK);
    expect(body.alert.kind).toBe("low-escrow");
    expect(getSlackNotificationLogs()[0]).toMatchObject({ status: "sent", campaignId: "42" });
  });

  it("records rate-limited attempts without posting", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await sendSlackAlert(WEBHOOK, alert, { fetchImpl });
    const second = await sendSlackAlert(WEBHOOK, alert, { fetchImpl });
    expect(second.status).toBe("rate_limited");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("records Slack rejections and network failures", async () => {
    const rejected = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "invalid_token" }, false, 400));
    const first = await sendSlackAlert(WEBHOOK, alert, {
      fetchImpl: rejected,
      force: true,
    });
    expect(first.status).toBe("failed");
    expect(first.httpStatus).toBe(400);
    expect(first.message).toContain("invalid_token");

    const throwing = vi.fn().mockRejectedValue(new Error("offline"));
    const second = await sendSlackAlert(
      WEBHOOK,
      { ...alert, kind: "test", campaignId: "test" },
      { fetchImpl: throwing, force: true },
    );
    expect(second.status).toBe("failed");
    expect(second.message).toBe("offline");
  });

  it("dispatches low escrow only when configured and below the threshold", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    expect(
      await dispatchLowEscrowAlert(
        { campaignId: "1", currentBalanceXlm: 5, initialBudgetXlm: 100 },
        { fetchImpl: vi.fn() },
      ),
    ).toBeNull();

    saveSlackSettings({
      webhookUrl: WEBHOOK,
      enabled: true,
      highValueThresholdXlm: 1000,
      lowEscrowThresholdPercent: 20,
    });
    const sent = await dispatchLowEscrowAlert(
      {
        campaignId: "1",
        campaignName: "Low",
        currentBalanceXlm: 5,
        initialBudgetXlm: 100,
      },
      { fetchImpl },
    );
    expect(sent?.status).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const healthy = await dispatchLowEscrowAlert(
      { campaignId: "2", currentBalanceXlm: 80, initialBudgetXlm: 100 },
      { fetchImpl },
    );
    expect(healthy).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("dispatches high-value conversions at or above the configured threshold", async () => {
    saveSlackSettings({
      webhookUrl: WEBHOOK,
      enabled: false,
      highValueThresholdXlm: 100,
      lowEscrowThresholdPercent: 20,
    });
    expect(
      await dispatchHighValueConversionAlert(
        { campaignId: "1", saleAmountXlm: 500 },
        { fetchImpl: vi.fn() },
      ),
    ).toBeNull();

    saveSlackSettings({
      webhookUrl: WEBHOOK,
      enabled: true,
      highValueThresholdXlm: 100,
      lowEscrowThresholdPercent: 20,
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    expect(
      await dispatchHighValueConversionAlert({ campaignId: "1", saleAmountXlm: 99 }, { fetchImpl }),
    ).toBeNull();
    const sent = await dispatchHighValueConversionAlert(
      { campaignId: "1", saleAmountXlm: 100, txHash: "abc" },
      { fetchImpl },
    );
    expect(sent?.status).toBe("sent");
  });

  it("sends test notifications without throttle and validates the URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const missing = await sendSlackTestNotification(undefined, { fetchImpl });
    expect(missing.status).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();

    saveSlackSettings({
      webhookUrl: WEBHOOK,
      enabled: true,
      highValueThresholdXlm: 1000,
      lowEscrowThresholdPercent: 20,
    });
    const first = await sendSlackTestNotification(undefined, { fetchImpl });
    const second = await sendSlackTestNotification(undefined, { fetchImpl });
    expect(first.status).toBe("sent");
    expect(second.status).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
