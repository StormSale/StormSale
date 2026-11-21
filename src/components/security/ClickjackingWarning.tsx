import React, { useState, useEffect } from "react";
import { isWindowEmbedded, enforceFrameBusting } from "../../lib/clickjackingDefense";
import { ShieldAlert, ExternalLink, X } from "lucide-react";

interface ClickjackingWarningProps {
  customWindow?: Window;
  onBreakout?: () => void;
}

export const ClickjackingWarning: React.FC<ClickjackingWarningProps> = ({
  customWindow,
  onBreakout,
}) => {
  const [embedded, setEmbedded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isFrame = isWindowEmbedded(customWindow);
    setEmbedded(isFrame);
  }, [customWindow]);

  if (!embedded || dismissed) {
    return null;
  }

  const handleBreakout = () => {
    if (onBreakout) {
      onBreakout();
      return;
    }
    const result = enforceFrameBusting(customWindow);
    if (!result.redirected && typeof window !== "undefined") {
      window.open(window.location.href, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      role="alert"
      data-testid="clickjacking-warning"
      className="fixed inset-x-0 top-0 z-[9999] bg-rose-950/95 border-b border-rose-500 text-white p-4 shadow-2xl backdrop-blur-md"
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-600/30 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/40">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-black text-rose-100 flex items-center gap-2">
              Unauthorized Iframe Embedding Detected (Clickjacking Defense)
            </h4>
            <p className="text-xs text-rose-300/90 mt-0.5">
              StormSale cannot be safely embedded within external websites. Potential transaction
              overlay tampering or click hijacking risk.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="btn-breakout"
            onClick={handleBreakout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in Safe Window
          </button>
          <button
            type="button"
            data-testid="btn-dismiss-warning"
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-800/50 transition"
            aria-label="Dismiss warning"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
