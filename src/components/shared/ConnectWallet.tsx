import { Button } from "../../components/ui/button";
import { useWeb3 } from "../../hooks/useWeb3";
import { Wallet, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export const ConnectWallet = () => {
  const { connectWallet, isConnected, userAddress } = useWeb3();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastConnector, setLastConnector] = useState<"freighter" | "mock" | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [retryDelayMs, setRetryDelayMs] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleConnect = async (connectorType: "freighter" | "mock") => {
    setIsConnecting(true);
    setConnectionError(null);
    setLastConnector(connectorType);
    setRetryDelayMs(0);
    try {
      await connectWallet(connectorType);
      setRetryCount(0);
      setRetryDelayMs(0);
    } catch (error) {
      console.error("Connection failed:", error);
      setConnectionError(
        error instanceof Error
          ? error.message
          : "Wallet connection failed. Please try again."
      );
      const nextCount = retryCount + 1;
      setRetryCount(nextCount);
      setRetryDelayMs(Math.min(1000 * 2 ** (nextCount - 1), 30000));
      return;
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  const handleRetry = () => {
    if (!lastConnector || isConnecting) return;
    if (retryDelayMs > 0) {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = setInterval(() => {
        setRetryDelayMs((prev) => {
          const next = Math.max(prev - 1000, 0);
          if (next === 0 && countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          return next;
        });
      }, 1000);
      retryTimerRef.current = setTimeout(() => {
        handleConnect(lastConnector);
      }, retryDelayMs);
    } else {
      handleConnect(lastConnector);
    }
  };

  if (isConnected) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
        <span className="text-sm font-medium font-mono text-zinc-900 dark:text-white">
          {formatAddress(userAddress!)}
        </span>
      </div>
    );
  }

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

      <Button
        variant="outline"
        onClick={() => handleConnect("mock")}
        disabled={isConnecting}
        className="border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-medium rounded-xl"
      >
        <ExternalLink className="w-3.5 h-3.5 mr-2 text-emerald-500" />
        Demo Testnet Mode
      </Button>

      {connectionError && (
        <div
          role="alert"
          className="flex items-start space-x-2 rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <p>{connectionError}</p>
            {lastConnector && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isConnecting}
                className="inline-flex items-center space-x-1 font-semibold underline offset-2 hover:no-underline disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" />
                <span>
                  {retryDelayMs > 0
                    ? `Retry in ${Math.ceil(retryDelayMs / 1000)}s`
                    : "Retry connection"}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
