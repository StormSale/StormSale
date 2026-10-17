const DB_NAME = "StormSale";
const DB_VERSION = 1;
const STORE_NAME = "dashboardMetrics";

type StoredMetric = {
  key: string;
  value: any;
  timestamp: number;
};

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
  });
};

export const idbCache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          const entry = req.result as StoredMetric | undefined;
          resolve(entry ? entry.value : null);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  },

  async set(key: string, value: any): Promise<void> {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ key, value, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {}
  },

  async remove(key: string): Promise<void> {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {}
  },

  async clear(): Promise<void> {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {}
  },
};

export const DASHBOARD_CACHE_KEYS = {
  userRole: "dashboard:userRole",
  xlmBalance: "dashboard:xlmBalance",
  network: "dashboard:network",
  isConnected: "dashboard:isConnected",
  connectorType: "dashboard:connectorType",
  metrics: "dashboard:metrics",
};
