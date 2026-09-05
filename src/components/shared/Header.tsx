import { Button } from "../../components/ui/button";
import { useWeb3 } from "../../hooks/useWeb3";
import { ThemeToggle } from "./ThemeToggle";
import { Wallet, ExternalLink, ChevronDown } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import logo from "../../assets/logo2.png";

export const Header = () => {
  const { userAddress, connectWallet, disconnectWallet, isConnected, connectorType } = useWeb3();
  const [showWalletOptions, setShowWalletOptions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowWalletOptions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const formatAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

  const handleConnect = async (type: "metamask" | "walletconnect") => {
    try {
      await connectWallet(type);
      setShowWalletOptions(false);
    } catch (error) {
      console.error("Connection failed:", error);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md shadow-sm">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        {/* Logo */}
        <div className="flex items-center">
          <a href="/" className="block group">
            <img
              src={logo}
              alt="StormSale Logo"
              className="h-12 md:h-14 w-auto object-contain group-hover:scale-105 transition-transform duration-300"
            />
          </a>
        </div>

        {/* Actions & Nav */}
        <div className="flex items-center space-x-6">
          {/* Nav Links */}
          <nav className="hidden md:flex items-center space-x-4 mr-4">
            {[
              "Home",
              "About Us",
              "Features",
              "How it Works",
              "Pricing",
              "Stats",
              "FAQ",
              "Contact",
            ].map((item) => (
              <a
                key={item}
                href={item === "Home" ? "/" : `#${item.toLowerCase().replace(/ /g, "-")}`}
                className="text-sm font-bold text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                {item}
              </a>
            ))}
          </nav>
          {/* Dark mode toggle */}
          <ThemeToggle />

          {/* Wallet area */}
          {isConnected ? (
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex items-center space-x-3 px-4 py-2 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-sm font-mono font-medium text-zinc-900 dark:text-white">
                  {userAddress && formatAddress(userAddress)}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg">
                  Stellar
                </span>
              </div>
              <Button
                variant="outline"
                onClick={disconnectWallet}
                className="h-10 px-4 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-semibold text-sm transition-all"
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <Button
                onClick={() => setShowWalletOptions(!showWalletOptions)}
                className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-semibold text-sm shadow-md transition-all"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Connect Wallet
                <ChevronDown
                  className={`w-3.5 h-3.5 ml-2 transition-transform ${showWalletOptions ? "rotate-180" : ""}`}
                />
              </Button>

              {showWalletOptions && (
                <div className="absolute top-full right-0 mt-2 w-60 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 z-50 overflow-hidden">
                  <div className="p-2 space-y-1">
                    <button
                      onClick={() => handleConnect("freighter" as any)}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-3 transition-colors group"
                    >
                      <div className="w-8 h-8 bg-purple-100 dark:bg-purple-500/10 rounded-lg flex items-center justify-center shrink-0">
                        <Wallet className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                          Freighter
                          <span className="text-[10px] bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-1.5 py-0.2 rounded">
                            Stellar
                          </span>
                        </div>
                        <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                          Official browser wallet
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => handleConnect("mock" as any)}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center space-x-3 transition-colors group"
                    >
                      <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center shrink-0">
                        <ExternalLink className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white">
                          Demo Testnet Account
                        </div>
                        <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                          Quick preview & audit mode
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
