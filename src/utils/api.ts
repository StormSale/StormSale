export const API_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001/api";

export type UserRole = "AFFILIATE" | "BUYER" | "ADMIN";

export const DEFAULT_ROLE: UserRole = "AFFILIATE";

export interface User {
  id?: string;
  walletAddress: string;
  role: UserRole;
  createdAt?: string;
}

const ROLES_CACHE_KEY = "bounty.userRole";

export const getCachedRole = (): UserRole | null => {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(ROLES_CACHE_KEY) : null;
    if (raw === "AFFILIATE" || raw === "BUYER" || raw === "ADMIN") {
      return raw as UserRole;
    }
    return null;
  } catch {
    return null;
  }
};

export const resolveInitialRole = (): UserRole => {
  const cached = getCachedRole();
  return cached ?? DEFAULT_ROLE;
};

export const isRoleSynced = (role: UserRole | null): role is UserRole => {
  return role === "AFFILIATE" || role === "BUYER" || role === "ADMIN";
};

export const setCachedRole = (role: UserRole | null) => {
  try {
    if (typeof window === "undefined") return;
    if (role === null) {
      window.localStorage.removeItem(ROLES_CACHE_KEY);
    } else {
      window.localStorage.setItem(ROLES_CACHE_KEY, role);
    }
  } catch {
    /* ignore storage errors */
  }
};

export const registerUser = async (walletAddress: string, role: UserRole = "AFFILIATE") => {
  try {
    const res = await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, role }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({} as { error?: string }));
      throw new Error(errorData.error || "Backend registration failed");
    }

    const user = (await res.json()) as User;
    if (user && user.role) {
      setCachedRole(user.role);
    }
    return user;
  } catch (error) {
    console.error("Backend registration failed:", error);
    throw error;
  }
};

export const fetchUserRole = async (walletAddress: string): Promise<UserRole | null> => {
  try {
    const res = await fetch(`${API_URL}/users/${encodeURIComponent(walletAddress)}`);
    if (!res.ok) {
      return null;
    }
    const user = (await res.json()) as User | null;
    if (user && user.role) {
      setCachedRole(user.role);
      return user.role as UserRole;
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch user role:", error);
    return null;
  }
};

export const syncUserRole = async (walletAddress: string): Promise<UserRole> => {
  const cached = getCachedRole();
  const fetched = await fetchUserRole(walletAddress);
  if (fetched) {
    return fetched;
  }
  return cached ?? DEFAULT_ROLE;
};

export const fetchCampaign = async (campaignId: string) => {
  try {
    const res = await fetch(`${API_URL}/campaigns/${campaignId}`);
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch campaign metadata:", error);
    return null;
  }
};
