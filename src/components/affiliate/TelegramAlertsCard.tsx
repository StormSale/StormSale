import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Send, Unlink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { useWeb3 } from "../../context/Web3Context";
import { CONNECT_TOKEN_TTL_SECONDS, type TelegramStatus } from "../../lib/telegramAlerts";
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
/** How often the card re-checks the bot binding while a connect link is open. */
export const CONNECT_POLL_MS = 4_000;

/** "Connect Telegram Alerts" section of the affiliate settings (issue #163). */
export function TelegramAlertsCard({ signer, openLink = defaultOpen }: TelegramAlertsCardProps) {
  const { userAddress, connectorType } = useWeb3();
  // State is keyed by wallet so switching accounts never shows another
  // wallet's connection, pending link or error.
  const [statusFor, setStatusFor] = useState<{ wallet: string; status: TelegramStatus } | null>(
    null,
  );
  const [pendingFor, setPendingFor] = useState<{ wallet: string; link: string } | null>(null);
  const [errorFor, setErrorFor] = useState<{ wallet: string | null; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const status = statusFor && statusFor.wallet === userAddress ? statusFor.status : null;
  const pendingLink = pendingFor && pendingFor.wallet === userAddress ? pendingFor.link : null;
  const error = errorFor && errorFor.wallet === userAddress ? errorFor.message : null;
  const canSign = Boolean(signer) || connectorType === "freighter";

  const refresh = useCallback(async () => {
    if (!userAddress) return;
    try {
      const next = await fetchTelegramStatus(userAddress);
      setStatusFor({ wallet: userAddress, status: next });
      if (next.connected) setPendingFor(null);
    } catch (err) {
      setErrorFor({
        wallet: userAddress,
        message: err instanceof Error ? err.message : "Could not load Telegram alert status.",
      });
    }
  }, [userAddress]);

  useEffect(() => {
    if (!userAddress) return;
    let cancelled = false;
    fetchTelegramStatus(userAddress)
      .then((next) => {
        if (!cancelled) setStatusFor({ wallet: userAddress, status: next });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setErrorFor({
            wallet: userAddress,
            message: err instanceof Error ? err.message : "Could not load Telegram alert status.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userAddress]);

  // While the affiliate is finishing in Telegram, poll until the bot confirms
  // the binding (or the one-time link expires).
  useEffect(() => {
    if (!pendingLink) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > CONNECT_TOKEN_TTL_SECONDS * 1000) {
        clearInterval(timer);
        setPendingFor(null);
        return;
      }
      void refresh();
    }, CONNECT_POLL_MS);
    return () => clearInterval(timer);
  }, [pendingLink, refresh]);

  const run = async (fn: (wallet: string) => Promise<void>) => {
    if (!userAddress) return;
    setBusy(true);
    setErrorFor(null);
    try {
      await fn(userAddress);
    } catch (err) {
      setErrorFor({
        wallet: userAddress,
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async (wallet) => {
      const link = await requestTelegramConnectLink(wallet, signer);
      setPendingFor({ wallet, link });
      openLink(link);
    });

  const update = (action: "mute" | "unmute" | "disconnect") =>
    run(async (wallet) => {
      setStatusFor({ wallet, status: await updateTelegramAlerts(wallet, action, signer) });
      if (action === "disconnect") setPendingFor(null);
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
            <p
              className="text-sm text-zinc-700 dark:text-zinc-200"
              data-testid="telegram-status"
              aria-live="polite"
            >
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
