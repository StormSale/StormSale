import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useNotification } from "../../context/NotificationContext";
import { initialMockCampaigns } from "./MyCampaignsList";
import {
  clearSlackNotificationLogs,
  getActiveSlackConfig,
  getSlackNotificationLogs,
  saveSlackConfig,
  testSlackWebhook,
  validateSlackWebhookUrl,
  watchCampaignEscrowLevels,
} from "../../lib/slackNotifier";
import type { SlackIntegrationConfig, SlackNotificationStatus } from "../../types/slack";
import {
  AlertCircle,
  BadgeCheck,
  Braces,
  MessageSquare,
  Play,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from "lucide-react";

const statusStyles: Record<SlackNotificationStatus, string> = {
  delivered:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
  failed:
    "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 border-rose-300 dark:border-rose-800",
  rate_limited:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-amber-300 dark:border-amber-800",
  skipped:
    "bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border-slate-300 dark:border-zinc-700",
};

const kindLabels: Record<string, string> = {
  "escrow.depletion": "Escrow depletion",
  "conversion.high_value": "High-value conversion",
  "ping.test": "Webhook test",
};

export const SlackIntegrationSettings = () => {
  const { showNotification } = useNotification();
  const [config, setConfig] = useState<SlackIntegrationConfig>(() => getActiveSlackConfig());
  const [logs, setLogs] = useState(() => getSlackNotificationLogs());
  const [isTesting, setIsTesting] = useState(false);
  const [isRunningMonitor, setIsRunningMonitor] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const urlValidation = validateSlackWebhookUrl(config.webhookUrl);

  const updateConfig = (patch: Partial<SlackIntegrationConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = () => {
    if (!urlValidation.isValid) {
      showNotification({
        type: "error",
        title: "Invalid Slack Webhook",
        message: urlValidation.reason,
      });
      return;
    }

    const saved = saveSlackConfig(config);
    setConfig(saved);
    showNotification({
      type: "success",
      title: "Slack settings saved",
      message: saved.isEnabled
        ? `Escrow alerts will post to ${saved.channelName}.`
        : "Settings stored, but the integration is disabled.",
    });
  };

  const handleTestWebhook = async () => {
    if (!urlValidation.isValid) {
      showNotification({
        type: "warning",
        title: "Webhook URL required",
        message: urlValidation.reason,
      });
      return;
    }

    setIsTesting(true);
    try {
      const result = await testSlackWebhook(config.webhookUrl, { config });
      setLogs(getSlackNotificationLogs());
      showNotification({
        type: result.delivered ? "success" : "error",
        title: result.delivered ? "Slack test message delivered" : "Slack test message failed",
        message: result.delivered
          ? `HTTP ${result.log?.httpStatusCode} from Slack for ${config.channelName}.`
          : result.suppressedReason || `HTTP ${result.log?.httpStatusCode}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleRunEscrowMonitor = async () => {
    setIsRunningMonitor(true);
    try {
      const saved = saveSlackConfig(config);
      setConfig(saved);
      const results = await watchCampaignEscrowLevels(initialMockCampaigns, { config: saved });
      setLogs(getSlackNotificationLogs());

      const sent = results.filter((r) => r.delivered).length;
      const suppressed = results.length - sent;
      showNotification({
        type: sent > 0 ? "success" : "info",
        title: "Escrow monitor sweep complete",
        message:
          results.length === 0
            ? "No campaign is below the alert threshold."
            : `${sent} alert(s) sent, ${suppressed} suppressed by rate limiting.`,
      });
    } finally {
      setIsRunningMonitor(false);
    }
  };

  const handleClearLogs = () => {
    clearSlackNotificationLogs();
    setLogs([]);
    setSelectedLogId(null);
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm">
        <CardHeader className="p-6 md:p-8 pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                  Slack Escrow Alerts
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                  Post Block Kit warnings to a Slack channel when a campaign budget runs low or an
                  affiliate logs a high-value conversion.
                </CardDescription>
              </div>
            </div>
            <Button
              type="button"
              variant={config.isEnabled ? "default" : "outline"}
              onClick={() => updateConfig({ isEnabled: !config.isEnabled })}
              aria-pressed={config.isEnabled}
              className="shrink-0 rounded-xl h-10 px-4 text-xs font-bold"
            >
              <BadgeCheck className="w-4 h-4 mr-2" />
              {config.isEnabled ? "Enabled" : "Disabled"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slack-webhook-url" className="font-bold text-sm">
                Incoming Webhook URL
              </Label>
              <Input
                id="slack-webhook-url"
                type="url"
                variant={config.webhookUrl && !urlValidation.isValid ? "error" : "default"}
                placeholder="https://hooks.slack.com/services/T00000000/B00000000/SHORT"
                value={config.webhookUrl}
                onChange={(e) => updateConfig({ webhookUrl: e.target.value })}
              />
              <p
                className={`text-xs font-medium flex items-start gap-1.5 ${
                  !config.webhookUrl
                    ? "text-zinc-500 dark:text-zinc-400"
                    : urlValidation.isValid
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {!config.webhookUrl ? (
                  <Braces className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                ) : urlValidation.isValid ? (
                  <BadgeCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                )}
                <span>
                  {!config.webhookUrl
                    ? "Create an Incoming Webhook in your Slack app and paste its URL."
                    : urlValidation.isValid
                      ? "Valid Slack Incoming Webhook URL."
                      : urlValidation.reason}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slack-channel" className="font-bold text-sm">
                Channel label
              </Label>
              <Input
                id="slack-channel"
                placeholder="#merchant-alerts"
                value={config.channelName}
                onChange={(e) => updateConfig({ channelName: e.target.value })}
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Shown in settings and used as the payload channel override.
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="slack-threshold" className="font-bold text-sm text-xs uppercase">
                Low escrow %
              </Label>
              <Input
                id="slack-threshold"
                type="number"
                min={1}
                max={99}
                value={config.lowEscrowThresholdPercent}
                onChange={(e) =>
                  updateConfig({ lowEscrowThresholdPercent: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack-high-value" className="font-bold text-sm text-xs uppercase">
                High-value XLM
              </Label>
              <Input
                id="slack-high-value"
                type="number"
                min={1}
                value={config.highValueConversionXlm}
                onChange={(e) => updateConfig({ highValueConversionXlm: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack-cooldown" className="font-bold text-sm text-xs uppercase">
                Cooldown (s)
              </Label>
              <Input
                id="slack-cooldown"
                type="number"
                min={30}
                value={config.cooldownSeconds}
                onChange={(e) => updateConfig({ cooldownSeconds: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack-per-minute" className="font-bold text-sm text-xs uppercase">
                Max per minute
              </Label>
              <Input
                id="slack-per-minute"
                type="number"
                min={1}
                max={60}
                value={config.maxNotificationsPerMinute}
                onChange={(e) =>
                  updateConfig({ maxNotificationsPerMinute: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slack-base-url" className="font-bold text-sm">
              Campaign link base URL
            </Label>
            <Input
              id="slack-base-url"
              type="url"
              value={config.appBaseUrl}
              onChange={(e) => updateConfig({ appBaseUrl: e.target.value })}
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Slack action buttons ("View Campaign", "Top Up Escrow") link back to this host.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleSave}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-11 px-5 font-bold"
            >
              <Save className="w-4 h-4 mr-2" />
              Save settings
            </Button>
            <Button
              variant="outline"
              onClick={handleTestWebhook}
              disabled={isTesting}
              className="rounded-xl h-11 px-5 font-bold border-slate-200 dark:border-zinc-800"
            >
              <Send className="w-4 h-4 mr-2" />
              {isTesting ? "Sending test message..." : "Test webhook URL"}
            </Button>
            <Button
              variant="outline"
              onClick={handleRunEscrowMonitor}
              disabled={isRunningMonitor}
              className="rounded-xl h-11 px-5 font-bold border-slate-200 dark:border-zinc-800"
            >
              <Play className="w-4 h-4 mr-2" />
              {isRunningMonitor ? "Running escrow monitor..." : "Run escrow monitor now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm">
        <CardHeader className="p-6 md:p-8 pb-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Notification log
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Every Slack dispatch attempt, including messages suppressed by rate limiting.
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLogs(getSlackNotificationLogs())}
                className="rounded-xl text-zinc-600 dark:text-zinc-300 font-bold"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearLogs}
                disabled={logs.length === 0}
                className="rounded-xl text-rose-600 dark:text-rose-400 font-bold"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 md:p-8">
          {logs.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No Slack notifications yet. Test the webhook URL or run the escrow monitor to populate
              this log.
            </p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 hover:bg-slate-50 dark:hover:bg-zinc-900/60 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${statusStyles[log.status]}`}
                    >
                      {log.status.replace("_", " ")}
                    </span>
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      {kindLabels[log.kind] || log.kind}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{log.channel}</span>
                    {log.httpStatusCode !== null && (
                      <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                        HTTP {log.httpStatusCode}
                      </span>
                    )}
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-zinc-900 dark:text-white mt-2">
                    {log.message}
                  </p>
                  {log.error && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{log.error}</p>
                  )}

                  {log.payload && (
                    <div className="mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLogId(log.id === selectedLogId ? null : log.id)}
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 h-8 px-2"
                      >
                        <Braces className="w-3.5 h-3.5 mr-1.5" />
                        {log.id === selectedLogId ? "Hide Block Kit payload" : "Show payload"}
                      </Button>
                      {log.id === selectedLogId && (
                        <pre className="mt-2 p-3 rounded-xl bg-zinc-950 text-zinc-100 text-[11px] overflow-x-auto max-h-64">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
