import { useWeb3 as useWeb3Context } from "../context/Web3Context";

export type UserRole = "admin" | "member" | "guest";

export interface RoleAwareWeb3 {
  role: UserRole | null;
  isRoleResolved: boolean;
  isAuthorized: (allowed: UserRole[]) => boolean;
}

const ROLE_PRIORITY: Record<UserRole, number> = {
  admin: 3,
  member: 2,
  guest: 1,
};

export const resolveRole = (dbRole?: string | null, uiRole?: string | null): UserRole | null => {
  const candidates = [dbRole, uiRole].filter(Boolean) as string[];
  if (candidates.length === 0) return null;
  return candidates.reduce<UserRole>((acc, candidate) => {
    const normalized = candidate.toLowerCase() as UserRole;
    if (!(normalized in ROLE_PRIORITY)) return acc;
    const current = ROLE_PRIORITY[acc];
    const next = ROLE_PRIORITY[normalized];
    return next > current ? normalized : acc;
  }, "guest");
};

export const useWeb3 = useWeb3Context;

export const useRole = (): RoleAwareWeb3 => {
  const ctx = useWeb3Context() as unknown as {
    role?: UserRole | null;
    dbRole?: string | null;
    uiRole?: string | null;
    isRoleResolved?: boolean;
  };
  const role = resolveRole(ctx.dbRole, ctx.uiRole) ?? ctx.role ?? null;
  const isRoleResolved = ctx.isRoleResolved ?? role !== null;
  const isAuthorized = (allowed: UserRole[]) =>
    role !== null && allowed.includes(role);
  return { role, isRoleResolved, isAuthorized };
};

export default useWeb3;
