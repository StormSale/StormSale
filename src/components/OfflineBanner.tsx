import React from 'react';

export const OfflineBanner: React.FC = () => {
  return (
    <div className="fixed inset-x-0 top-0 bg-amber-500 text-white text-center py-2 z-50 shadow-md">
      You are currently offline. Some features may be unavailable.
    </div>
  );
};
