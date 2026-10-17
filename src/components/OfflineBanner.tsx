import React from "react";

export const OfflineBanner: React.FC = () => {
  return (
    <div className="fixed inset-x-0 top-0 bg-amber-500 text-white text-center py-2 z-50 shadow-md flex items-center justify-center gap-2 text-sm font-medium">
      <span className="bg-amber-700 text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
        Offline Mode
      </span>
      <span>You are currently offline. Some features may be unavailable.</span>
    </div>
  );
};
