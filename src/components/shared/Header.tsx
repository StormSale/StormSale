import { Button } from "../../components/ui/button";
import { useWeb3 } from "../../hooks/useWeb3";
import { ThemeToggle } from "./ThemeToggle";
import { Wallet, Menu, X, Coins, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "../../assets/logo2.png";

export const Header = () => {
  const { userAddress, openWalletModal, disconnectWallet, isConnected, xlmBalance } = useWeb3();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const formatAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "About Us", href: "#about-us" },
    { label: "Features", href: "#features" },
    { label: "How it Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "Stats", href: "#stats" },
    { label: "FAQ", href: "#faq" },
    { label: "Contact", href: "#contact" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md shadow-sm">
      <div className="container mx-auto px-4 py-3 sm:py-4 flex justify-between items-center">
        {/* Logo */}
        <div className="flex items-center">
          <a href="/" className="block group">
            <img
              src={logo}
              alt="StormSale Logo"
              className="h-10 sm:h-12 md:h-14 w-auto object-contain group-hover:scale-105 transition-transform duration-300"
            />
          </a>
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden lg:flex items-center space-x-5">
          {navLinks.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden sm:flex items-center space-x-4">
          <ThemeToggle />

          {isConnected ? (
            <div className="flex items-center space-x-2.5">
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-mono font-semibold text-zinc-900 dark:text-white">
                  {userAddress && formatAddress(userAddress)}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded">
                  {xlmBalance} XLM
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnectWallet}
                className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-bold text-xs transition-all"
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              onClick={openWalletModal}
              className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all"
            >
              <Wallet className="w-4 h-4 mr-2" />
              Connect Wallet
            </Button>
          )}
        </div>

        {/* Mobile / Tablet Controls (Right) */}
        <div className="flex sm:hidden items-center space-x-2">
          <ThemeToggle />
          {!isConnected ? (
            <Button
              size="sm"
              onClick={openWalletModal}
              className="h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
            >
              <Wallet className="w-3.5 h-3.5 mr-1" />
              Connect
            </Button>
          ) : (
            <button
              onClick={openWalletModal}
              className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center space-x-1.5 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{userAddress && formatAddress(userAddress)}</span>
            </button>
          )}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
            aria-label="Toggle Menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Navigation Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="sm:hidden border-t border-slate-200 dark:border-zinc-800 bg-white/98 dark:bg-zinc-950/98 backdrop-blur-xl px-4 py-4 space-y-3"
          >
            {isConnected && (
              <div className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-zinc-400">CONNECTED WALLET</div>
                    <div className="text-xs font-mono font-bold text-zinc-900 dark:text-white">
                      {userAddress && formatAddress(userAddress)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-bold text-zinc-400">BALANCE</div>
                  <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center">
                    <Coins className="w-3 h-3 mr-1" />
                    {xlmBalance} XLM
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {navLinks.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {item.label}
                </a>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
              {isConnected ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    disconnectWallet();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                >
                  Disconnect Wallet
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    openWalletModal();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
                >
                  <Wallet className="w-3.5 h-3.5 mr-2" />
                  Select Stellar Wallet
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
