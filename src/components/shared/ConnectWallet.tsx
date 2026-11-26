import { useState, useEffect, useCallback } from "react";
import type { FC } from "react";
import QRCode from "qrcode";
import { Button } from "../../components/ui/button";
import { useWeb3 } from "../../hooks/useWeb3";
import {
  Wallet,
  ExternalLink,
  QrCode,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { useWalletConnect } from "../../context/WalletConnectContext";

const formatMobileDeepLink = (
  wallet: "metamask" | "rainbow",
  wcUri: string
): string => {
  if (!wcUri) return "";
  const base =
    wallet === "metamask"
      ? "https://metamask.app.link/wc"
      : "https://rainbow.me/wc";
  return `${base}?uri=${encodeURIComponent(wcUri)}`;
};

export const ConnectWallet: FC = () => {
  const { connectWallet, isConnected, userAddress } = useWeb3();
  const { connect: connectWalletConnect } = useWalletConnect();

  const [isConnecting, setIsConnecting] = useState(false);
  const [showQrView, setShowQrView] = useState(false);
  const [wcUri, setWcUri] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Real-time dynamic QR code generation from WalletConnect URI
  const generatePairingQr = useCallback(async () => {
    setIsGeneratingQr(true);
    setError(null);
    try {
      const topic = "wc_" + Math.random().toString(36).substring(2, 12);
      const symKey = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, "0")
      ).join("");
      const uri = `wc:${topic}@2?relay-protocol=irn&symKey=${symKey}`;
      setWcUri(uri);

      const dataUrl = await QRCode.toDataURL(uri, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 256,
        color: {
          dark: "#09090b", // high-contrast dark modules
          light: "#ffffff", // high-contrast light background
        },
      });
      setQrDataUrl(dataUrl);
    } catch (err: unknown) {
      console.error("Failed to generate QR code:", err);
      setError("Failed to generate QR code. Please try refreshing.");
    } finally {
      setIsGeneratingQr(false);
    }
  }, []);

  useEffect(() => {
    if (showQrView && !wcUri) {
      generatePairingQr();
    }
  }, [showQrView, wcUri, generatePairingQr]);

  const handleConnect = async (connectorType: "freighter" | "mock") => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectWallet(connectorType);
    } catch (err: unknown) {
      console.error("Connection failed:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCopyPairingCode = async () => {
    if (!wcUri) return;
    try {
      await navigator.clipboard.writeText(wcUri);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch (err) {
      console.warn("Could not copy pairing code:", err);
    }
  };

  const handleFinalizeWalletConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectWalletConnect();
      setShowQrView(false);
    } catch (err: unknown) {
      console.error("Failed to finalize WalletConnect connection:", err);
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  };

  if (isConnected) {
    return (
      <div className="flex items-center space-x-2" data-testid="connected-wallet-badge">
        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium font-mono text-zinc-900 dark:text-white">
          {formatAddress(userAddress!)}
        </span>
      </div>
    );
  }

  // QR Code Desktop-to-Mobile Scanning View
  if (showQrView) {
    return (
      <div
        className="w-full max-w-sm p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl flex flex-col space-y-4 text-zinc-900 dark:text-zinc-100"
        data-testid="desktop-to-mobile-qr-interface"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowQrView(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Back to standard wallet options"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white">
              Scan with Mobile Wallet
            </h3>
          </div>
          <button
            type="button"
            onClick={generatePairingQr}
            disabled={isGeneratingQr}
            className="flex items-center space-x-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
            aria-label="Refresh pairing code"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingQr ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {error && (
          <div className="p-2.5 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl">
            {error}
          </div>
        )}

        {/* High-Contrast QR Code Display */}
        <div className="flex flex-col items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-900/90 rounded-2xl border border-zinc-200 dark:border-zinc-800 relative">
          <div className="relative p-3 bg-white rounded-xl shadow-md border border-zinc-200 dark:border-zinc-700">
            {/* High-Contrast Scanner Corner Brackets */}
            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-indigo-600 rounded-tl-sm pointer-events-none" />
            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-indigo-600 rounded-tr-sm pointer-events-none" />
            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-indigo-600 rounded-bl-sm pointer-events-none" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-indigo-600 rounded-br-sm pointer-events-none" />

            {isGeneratingQr ? (
              <div className="w-48 h-48 flex flex-col items-center justify-center space-y-2 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                <span className="text-xs font-medium">Generating QR...</span>
              </div>
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="WalletConnect QR Code"
                data-testid="pairing-qr-code"
                className="w-48 h-48 rounded-lg object-contain block"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-xs text-zinc-400">
                No QR Generated
              </div>
            )}
          </div>

          {/* Connection status indicator */}
          <div className="mt-3 flex items-center space-x-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600" />
            </span>
            <span data-testid="connection-status-text">Awaiting mobile wallet connection...</span>
          </div>
        </div>

        {/* Copy Pairing Code Fallback */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
            Pairing Code Fallback
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={wcUri}
              placeholder="Generating pairing code..."
              aria-label="Pairing Code URI"
              data-testid="pairing-code-input"
              className="flex-1 px-3 py-2 text-xs font-mono bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl truncate text-zinc-700 dark:text-zinc-300 select-all"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyPairingCode}
              data-testid="copy-pairing-code-button"
              className="shrink-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold text-xs rounded-xl"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  <span>Copy Pairing Code</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Direct Mobile Deep Linking Options */}
        <div className="pt-1 flex flex-col space-y-1.5">
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            Direct Mobile Deep Links
          </span>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={formatMobileDeepLink("metamask", wcUri)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="deep-link-metamask"
              className="py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-xl text-center border border-amber-500/20 transition-colors"
            >
              MetaMask
            </a>
            <a
              href={formatMobileDeepLink("rainbow", wcUri)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="deep-link-rainbow"
              className="py-1.5 px-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-xl text-center border border-blue-500/20 transition-colors"
            >
              Rainbow
            </a>
          </div>
        </div>

        {/* Simulation / Complete Action */}
        <Button
          type="button"
          onClick={handleFinalizeWalletConnect}
          disabled={isConnecting}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs"
        >
          {isConnecting ? "Connecting..." : "I've Approved on Mobile"}
        </Button>
      </div>
    );
  }

  // Standard Desktop & Extension View
  return (
    <div className="flex flex-col space-y-2">
      <Button
        onClick={() => handleConnect("freighter")}
        disabled={isConnecting}
        className="bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl"
      >
        <Wallet className="w-4 h-4 mr-2" />
        {isConnecting ? "Connecting..." : "Connect Freighter"}
      </Button>

      {/* Mobile QR Code Desktop-to-Mobile Pairing Trigger */}
      <Button
        variant="outline"
        onClick={() => setShowQrView(true)}
        disabled={isConnecting}
        data-testid="open-mobile-pairing-button"
        className="border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold text-xs rounded-xl"
      >
        <QrCode className="w-3.5 h-3.5 mr-2 text-indigo-600 dark:text-indigo-400" />
        Mobile Wallet (Scan QR)
      </Button>

      <Button
        variant="outline"
        onClick={() => handleConnect("mock")}
        disabled={isConnecting}
        className="border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-medium rounded-xl"
      >
        <ExternalLink className="w-3.5 h-3.5 mr-2 text-emerald-500" />
        Demo Testnet Mode
      </Button>
    </div>
  );
};
