import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Send, Unlink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { useWeb3 } from "../../context/Web3Context";
import type { TelegramStatus } from "../../lib/telegramAlerts";
import {
  fetchTelegramStatus,
  requestTelegramConnectLink,
  updateTelegramAlerts,
  type MessageSigner,
} from "../../lib/telegramClient";

export interface TelegramAlertsCardProps {
  /** Override the wallet signer (tests). Defaults to Freighter. */
  signer?: MessageSigner;
  /** Opens the bot deep link. Defaults to a new tab. */
  openLink?: (url: string) => void;
}

const defaultOpen = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

/** "Connect Telegram Alerts" section of the affiliate settings (issue #163). */
export function TelegramAlertsCard({ signer, openLink = defaultOpen }: TelegramAlertsCardProps) {
  const { userAddress, connectorType } = useWeb3();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<string | null>(null);

  const canSign = Boolean(signer) || connectorType === "freighter";

  const refresh = useCallback(async () => {
    if (!userAddress) return;
    try {
      setStatus(await fetchTelegramStatus(userAddress));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Telegram alert status.");
    }
  }, [userAddress]);

  useEffect(() => {
    if (!userAddress) return;
    let cancelled = false;
    fetchTelegramStatus(userAddress)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load Telegram alert status.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userAddress]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      if (!userAddress) return;
      const link = await requestTelegramConnectLink(userAddress, signer);
      setPendingLink(link);
      openLink(link);
    });

  const update = (action: "mute" | "unmute" | "disconnect") =>
    run(async () => {
      if (!userAddress) return;
      setStatus(await updateTelegramAlerts(userAddress, action, signer));
      if (action === "disconnect") setPendingLink(null);
    });

  return (
    <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl md:col-span-2">
      <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-sky-50 dark:bg-sky-950/60 rounded-xl flex items-center justify-center text-sky-600 dark:text-sky-400">
            <Send className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
              Connect Telegram Alerts
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
              Get a message from @StormSaleBot the moment a referral converts.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-8 space-y-4">
        {!userAddress ? (
          <p className="text-sm text-zinc-500">Connect your wallet to set up Telegram alerts.</p>
        ) : !canSign ? (
          <p className="text-sm text-zinc-500">
            Telegram alerts need a Freighter signature to prove you own this wallet. Reconnect with
            Freighter to set them up.
          </p>
        ) : status?.connected ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-700 dark:text-zinc-200" data-testid="telegram-status">
              {status.muted ? "Connected · alerts muted" : "Connected · alerts on"}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void update(status.muted ? "unmute" : "mute")}
              >
                {status.muted ? (
                  <Bell className="w-4 h-4 mr-2" />
                ) : (
                  <BellOff className="w-4 h-4 mr-2" />
                )}
                {status.muted ? "Unmute alerts" : "Mute alerts"}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void update("disconnect")}>
                <Unlink className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Button disabled={busy} onClick={() => void connect()}>
              <Send className="w-4 h-4 mr-2" />
              Connect Telegram
            </Button>
            {pendingLink && (
              <p className="text-xs text-zinc-500">
                Press Start in Telegram to finish. Link didn&apos;t open?{" "}
                <a
                  href={pendingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Open @StormSaleBot
                </a>
                {" · "}
                <button type="button" className="underline" onClick={() => void refresh()}>
                  I&apos;ve connected
                </button>
              </p>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
