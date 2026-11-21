// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlackSettingsCard } from "../components/advertiser/SlackSettingsCard";
import {
  getSlackNotificationLogs,
  loadSlackSettings,
  resetSlackRateLimit,
  saveSlackSettings,
} from "../lib/slackAlerts";

const WEBHOOK = "https://hooks.slack.com/services/T000/B000/abc123";

beforeEach(() => {
  localStorage.clear();
  resetSlackRateLimit();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setValue(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("SlackSettingsCard", () => {
  it("saves the webhook and thresholds", () => {
    render(<SlackSettingsCard />);
    setValue("Slack Incoming Webhook URL", WEBHOOK);
    setValue("Low escrow warning (%)", "12");
    setValue("High-value sale threshold (XLM)", "2500");
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(loadSlackSettings()).toMatchObject({
      webhookUrl: WEBHOOK,
      lowEscrowThresholdPercent: 12,
      highValueThresholdXlm: 2500,
    });
    expect(screen.getByRole("status").textContent).toContain("saved");
  });

  it("validates the webhook before saving or testing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SlackSettingsCard />);
    setValue("Slack Incoming Webhook URL", "https://evil.example/services/T/B/C");

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByRole("alert").textContent).toContain("hooks.slack.com");
    expect(localStorage.getItem("stormsale.slack.settings")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Send test notification/ }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a test notification and renders the notification log", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    saveSlackSettings({
      webhookUrl: WEBHOOK,
      enabled: true,
      highValueThresholdXlm: 1000,
      lowEscrowThresholdPercent: 20,
    });

    render(<SlackSettingsCard />);
    fireEvent.click(screen.getByRole("button", { name: /Send test notification/ }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("delivered"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSlackNotificationLogs()[0]).toMatchObject({ kind: "test", status: "sent" });
    expect(document.body.textContent).toContain("Test · Slack integration test");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(getSlackNotificationLogs()).toEqual([]);
    expect(document.body.textContent).toContain("No Slack notifications yet");
  });

  it("pauses notifications without deleting the webhook", () => {
    render(<SlackSettingsCard />);
    setValue("Slack Incoming Webhook URL", WEBHOOK);
    fireEvent.click(screen.getByRole("switch", { name: "Enable Slack notifications" }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(loadSlackSettings()).toMatchObject({ webhookUrl: WEBHOOK, enabled: false });
  });
});
