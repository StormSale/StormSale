import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import {
  LOW_ESCROW_THRESHOLD_PERCENT,
  clearSlackNotificationLogs,
  getSlackNotificationLogs,
  loadSlackSettings,
  saveSlackSettings,
  sendSlackTestNotification,
  validateSlackWebhook,
  type SlackNotificationLog,
  type SlackSettings,
} from "../../lib/slackAlerts";

const KIND_LABELS: Record<SlackNotificationLog["kind"], string> = {
  "low-escrow": "Low escrow",
  "high-value-conversion": "High-value conversion",
  test: "Test",
};

const STATUS_STYLES: Record<SlackNotificationLog["status"], string> = {
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30",
  failed:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30",
  rate_limited:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30",
  skipped:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
};

export function SlackSettingsCard() {
  const [settings, setSettings] = useState<SlackSettings>(() => loadSlackSettings());
  const [logs, setLogs] = useState<SlackNotificationLog[]>(() => getSlackNotificationLogs());
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  const update = <K extends keyof SlackSettings>(key: K, value: SlackSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setFeedback(null);
  };

  const handleSave = () => {
    if (settings.webhookUrl.trim() && validateSlackWebhook(settings.webhookUrl)) {
      setFeedback({ type: "error", message: validateSlackWebhook(settings.webhookUrl)! });
      return;
    }
    const saved = saveSlackSettings(settings);
    setSettings(saved);
    setFeedback({ type: "success", message: "Slack alert settings saved." });
  };

  const handleTest = async () => {
    const validationError = validateSlackWebhook(settings.webhookUrl);
    if (validationError) {
      setFeedback({ type: "error", message: validationError });
      return;
    }
    setBusy("test");
    setFeedback(null);
    try {
      saveSlackSettings(settings);
      const log = await sendSlackTestNotification(settings.webhookUrl);
      setLogs(getSlackNotificationLogs());
      setFeedback(
        log.status === "sent"
          ? { type: "success", message: "Test notification delivered to your Slack channel." }
          : { type: "error", message: log.message },
      );
    } finally {
      setBusy(null);
    }
  };

  const handleClearLogs = () => {
    clearSlackNotificationLogs();
    setLogs([]);
  };

  return (
    <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
      <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
              Slack Escrow Alerts
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
              Post low escrow and high-value conversion alerts to a Slack channel through an
              Incoming Webhook.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <label
            htmlFor="slack-webhook-url"
            className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider"
          >
            Slack Incoming Webhook URL
          </label>
          <Input
            id="slack-webhook-url"
            type="url"
            value={settings.webhookUrl}
            onChange={(e) => update("webhookUrl", e.target.value)}
            placeholder="https://hooks.slack.com/services/T000/B000/XXXX"
            className="h-11 rounded-xl font-mono text-xs bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
            spellCheck={false}
            autoComplete="off"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Create one in Slack under{" "}
            <a
              href="https://api.slack.com/messaging/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              Incoming Webhooks <ExternalLink className="w-3 h-3" />
            </a>
            . The URL is stored in this browser and sent only to the StormSale proxy.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="slack-low-escrow"
              className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider"
            >
              Low escrow warning (%)
            </label>
            <Input
              id="slack-low-escrow"
              type="number"
              min={1}
              max={LOW_ESCROW_THRESHOLD_PERCENT}
              value={settings.lowEscrowThresholdPercent}
              onChange={(e) => update("lowEscrowThresholdPercent", Number(e.target.value))}
              className="h-11 rounded-xl bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
            />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Alerts fire below {LOW_ESCROW_THRESHOLD_PERCENT}% remaining, at most once per campaign
              every 5 minutes.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="slack-high-value"
              className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider"
            >
              High-value sale threshold (XLM)
            </label>
            <Input
              id="slack-high-value"
              type="number"
              min={0}
              step="1"
              value={settings.highValueThresholdXlm}
              onChange={(e) => update("highValueThresholdXlm", Number(e.target.value))}
              className="h-11 rounded-xl bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
            />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              A conversion alert posts when a logged sale reaches this amount.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800">
          <div>
            <div className="font-bold text-sm text-zinc-900 dark:text-white">
              Send Slack notifications
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Pause alerts without deleting your webhook.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            aria-label="Enable Slack notifications"
            onClick={() => update("enabled", !settings.enabled)}
            className={`w-12 h-7 rounded-full transition-colors relative p-1 ${
              settings.enabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-zinc-700"
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                settings.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
          >
            Save settings
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleTest()}
            disabled={busy === "test"}
            className="rounded-xl font-bold border-slate-200 dark:border-zinc-800"
          >
            <Send className="w-4 h-4 mr-2" />
            {busy === "test" ? "Sending test..." : "Send test notification"}
          </Button>
        </div>

        {feedback && (
          <div
            role={feedback.type === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${
              feedback.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/60">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Notification log</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                The last {logs.length} alert{logs.length === 1 ? "" : "s"} from this browser.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLogs(getSlackNotificationLogs())}
                className="rounded-xl border-slate-200 dark:border-zinc-800"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Refresh
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearLogs}
                disabled={logs.length === 0}
                className="rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Clear
              </Button>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 p-6 text-center">
              <Bell className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No Slack notifications yet. Send a test or wait for a low escrow alert.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {logs.slice(0, 10).map((log) => (
                <li
                  key={log.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 p-3"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider shrink-0 ${STATUS_STYLES[log.status]}`}
                    >
                      {log.status === "sent" ? (
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                      ) : (
                        <XCircle className="w-3 h-3 mr-1" />
                      )}
                      {log.status.replace("_", " ")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                        {KIND_LABELS[log.kind]} · {log.campaignName || `Campaign ${log.campaignId}`}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {log.message}
                      </p>
                    </div>
                  </div>
                  <time
                    dateTime={log.createdAt}
                    className="text-[11px] text-zinc-400 shrink-0 sm:text-right"
                  >
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
