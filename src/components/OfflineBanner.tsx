import React from "react";

export const OfflineBanner: React.FC = () => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-500 text-white text-center py-2 px-4 shadow-md flex items-center justify-center gap-2 text-sm font-medium z-50"
    >
      <span className="bg-amber-700 text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
        Offline Mode
      </span>
      <span>You are currently offline. Some features may be unavailable.</span>
    </div>
  );
};
