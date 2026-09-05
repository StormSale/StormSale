import { Button } from "../../components/ui/button";
import { useWeb3 } from "../../hooks/useWeb3";
import { Wallet, ExternalLink } from "lucide-react";
import { useState } from "react";

export const ConnectWallet = () => {
  const { connectWallet, isConnected, userAddress } = useWeb3();
  const [isConnecting, setIsConnecting] = useState(false);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleConnect = async (connectorType: "freighter" | "mock") => {
    setIsConnecting(true);
    try {
      await connectWallet(connectorType);
    } catch (error) {
      console.error("Connection failed:", error);
    } finally {
      setIsConnecting(false);
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
    </div>
  );
};
