import { useEffect, useState } from 'react';

/**
 * Hook to track online/offline status of the browser.
 * Returns true when online, false when offline.
 */
export const useOnlineStatus = (): boolean => {
  const [online, setOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
};
