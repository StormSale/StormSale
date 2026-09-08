import React, { useState } from "react";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, Shield, LogOut, Menu, X, Layers } from "lucide-react";
import { useWeb3 } from "../../hooks/useWeb3";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { id: string; label: string; icon: LucideIcon }[];
  className?: string;
  onBack?: () => void;
  roleName: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  tabs,
  className,
  onBack,
  roleName,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const { disconnectWallet } = useWeb3();

  const activeTabObject = tabs.find((t) => t.id === activeTab) || tabs[0];
  const ActiveIcon = activeTabObject ? activeTabObject.icon : Layers;

  return (
    <>
      {/* =========================================================================
          1. MOBILE & TABLET TOP BAR & DRAWER (Visible on screens < lg / 1024px)
         ========================================================================= */}
      <div className="lg:hidden w-full bg-white dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 sticky top-0 z-30 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="w-8 h-8 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-900"
                title="Back to Role Selector"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
                <ActiveIcon className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-zinc-900 dark:text-white truncate max-w-[140px] sm:max-w-[200px]">
                  {activeTabObject ? activeTabObject.label : "Menu"}
                </span>
                <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                  {roleName}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
              className="h-8 px-3 rounded-xl border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 text-xs font-bold flex items-center space-x-1.5"
            >
              {isMobileDrawerOpen ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </>
              ) : (
                <>
                  <Menu className="w-3.5 h-3.5" />
                  <span>Tabs</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Slide-Down Drawer */}
        <AnimatePresence>
          {isMobileDrawerOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl px-4 py-4 space-y-2 max-h-[70vh] overflow-y-auto"
            >
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 px-1">
                Navigation Tabs
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tabs.map((tab) => {
                  const IconComp = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        onTabChange(tab.id);
                        setIsMobileDrawerOpen(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2.5 rounded-xl flex items-center space-x-3 text-left transition-colors font-medium text-xs sm:text-sm",
                        isActive
                          ? "bg-zinc-900 dark:bg-indigo-600 text-white shadow-sm"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900",
                      )}
                    >
                      <IconComp
                        className={cn(
                          "w-4 h-4 shrink-0",
                          isActive ? "text-white" : "text-zinc-500",
                        )}
                      />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 mt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                {onBack && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onBack();
                    }}
                    className="text-xs font-semibold text-zinc-600 dark:text-zinc-400"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                    Role Switcher
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    disconnectWallet();
                    setIsMobileDrawerOpen(false);
                  }}
                  className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1" />
                  Disconnect
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* =========================================================================
          2. DESKTOP SIDEBAR (Visible on screens >= lg / 1024px)
         ========================================================================= */}
      <motion.div
        initial={false}
        animate={{ width: isCollapsed ? 80 : 320 }}
        className={cn(
          "hidden lg:flex flex-col bg-white dark:bg-zinc-950/50 border-r border-slate-200 dark:border-zinc-800 shadow-sm relative transition-colors duration-300 shrink-0",
          className,
        )}
      >
        {/* Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm z-50 hover:bg-slate-100 dark:hover:bg-zinc-800"
        >
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </Button>

        {/* Header / Back */}
        <div className="p-6 border-b border-slate-200 dark:border-zinc-800">
          <AnimatePresence mode="wait">
            {!isCollapsed ? (
              <motion.div
                key="full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {onBack && (
                  <Button
                    variant="ghost"
                    onClick={onBack}
                    className="w-full justify-start text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-900 mb-4 h-10 rounded-xl"
                  >
                    <ChevronLeft className="w-4 h-4 mr-3" />
                    Role Selector
                  </Button>
                )}
                <div className="flex items-center space-x-3 px-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold text-zinc-900 dark:text-white tracking-tight">
                    {roleName}
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex justify-center"
              >
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                  <Shield className="w-5 h-5 text-white" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex-1 p-4 overflow-y-auto overflow-x-hidden">
          <div className="space-y-1.5">
            {tabs.map((tab) => {
              const IconComponent = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <Button
                  key={tab.id}
                  variant="ghost"
                  className={cn(
                    "w-full h-12 rounded-xl transition-all duration-200 group relative",
                    isActive
                      ? "bg-zinc-900 dark:bg-indigo-600 text-white font-medium shadow-md"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-white",
                    isCollapsed ? "justify-center px-0" : "justify-start px-4",
                  )}
                  onClick={() => onTabChange(tab.id)}
                >
                  <IconComponent
                    className={cn(
                      "w-5 h-5 shrink-0 transition-transform duration-200",
                      !isCollapsed && "mr-3",
                      isActive ? "opacity-100" : "opacity-70 group-hover:scale-110",
                    )}
                  />
                  {!isCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="truncate"
                    >
                      {tab.label}
                    </motion.span>
                  )}
                  {isActive && isCollapsed && (
                    <motion.div
                      layoutId="active-pill"
                      className="absolute left-0 w-1 h-6 bg-white rounded-r-full"
                    />
                  )}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-zinc-800 flex flex-col gap-3">
          <Button
            variant="ghost"
            onClick={disconnectWallet}
            className={cn(
              "w-full h-12 rounded-xl transition-all duration-200 group flex items-center border border-transparent hover:border-red-200 dark:hover:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/20 text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400",
              isCollapsed ? "justify-center px-0" : "justify-start px-4",
            )}
            title="Disconnect Wallet"
          >
            <LogOut
              className={cn(
                "w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:-translate-x-1",
                !isCollapsed && "mr-3",
              )}
            />
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="font-medium truncate"
              >
                Disconnect Wallet
              </motion.span>
            )}
          </Button>

          <div
            className={cn(
              "bg-slate-50 dark:bg-zinc-900/50 rounded-xl border border-slate-200 dark:border-zinc-800/50 transition-all duration-300",
              isCollapsed ? "p-2" : "p-4",
            )}
          >
            {!isCollapsed ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                    Status
                  </div>
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                </div>
                <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">
                  NIST Compliant
                </div>
              </>
            ) : (
              <div className="flex justify-center">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
};
