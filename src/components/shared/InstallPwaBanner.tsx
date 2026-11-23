import React, { useState } from "react";
import { Download, Smartphone, X, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";
import { usePwaInstall } from "../../hooks/usePwaInstall";

export interface InstallPwaBannerProps {
  className?: string;
  forceShow?: boolean;
}

export const InstallPwaBanner: React.FC<InstallPwaBannerProps> = ({
  className = "",
  forceShow = false,
}) => {
  const { isInstallable, isInstalled, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  if (isInstalled || dismissed) return null;
  if (!isInstallable && !forceShow) return null;

  const handleInstallClick = async () => {
    const installed = await promptInstall();
    if (installed) {
      setInstallSuccess(true);
      setTimeout(() => setDismissed(true), 3000);
    }
  };

  return (
    <div
      role="banner"
      className={`p-3.5 rounded-2xl bg-gradient-to-r from-indigo-950/70 via-slate-900 to-slate-950 border border-indigo-500/40 shadow-xl flex items-center justify-between gap-4 flex-wrap ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
          <Download className="w-5 h-5 animate-bounce" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs sm:text-sm font-bold text-white">Install StormSale App</h4>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Smartphone className="w-3 h-3" />
              Mobile & Desktop
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Install full-screen standalone app for instant offline cache and faster Soroban actions.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {installSuccess ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30">
            <CheckCircle2 className="w-4 h-4" /> Installed!
          </span>
        ) : (
          <Button
            size="sm"
            onClick={handleInstallClick}
            className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Install App
          </Button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-400 hover:text-slate-200 p-1 rounded-lg"
          aria-label="Dismiss install prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
