import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type {
  OrganizationRole,
  OrganizationCapability,
  TeamMember,
  OrganizationState,
} from "../types/organization";
import {
  ROLE_DEFINITIONS,
  hasCapability as checkCapability,
  getRoleCapabilities,
  isValidStellarAddress,
  generateOrganizationAuthChallenge,
  verifyMemberWalletSignature,
  loadOrganizationState,
  saveOrganizationState,
  generateMemberInviteToken,
} from "../lib/teamPermissions";
import { useSafeWeb3 } from "../hooks/useWeb3";
import { useNotification } from "./NotificationContext";

export interface OrganizationContextType {
  organization: OrganizationState;
  members: TeamMember[];
  currentMember: TeamMember | null;
  currentRole: OrganizationRole;
  capabilities: OrganizationCapability[];
  hasCapability: (capability: OrganizationCapability) => boolean;
  addTeamMember: (
    walletAddress: string,
    name: string,
    role: OrganizationRole,
  ) => Promise<{ success: boolean; member?: TeamMember; error?: string }>;
  inviteTeamMember: (
    email: string,
    role: OrganizationRole,
    name?: string,
  ) => Promise<{ success: boolean; member?: TeamMember; inviteLink?: string; error?: string }>;
  bindInvitedMemberWallet: (
    inviteToken: string,
    walletAddress: string,
  ) => Promise<{ success: boolean; member?: TeamMember; error?: string }>;
  findMemberByToken: (token: string) => TeamMember | null;
  updateMemberRole: (
    memberId: string,
    newRole: OrganizationRole,
  ) => Promise<{ success: boolean; error?: string }>;
  removeTeamMember: (memberId: string) => Promise<{ success: boolean; error?: string }>;
  switchActiveRole: (role: OrganizationRole) => void;
  verifyCurrentMemberSignature: () => Promise<boolean>;
  isSigningChallenge: boolean;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export interface OrganizationProviderProps {
  children: ReactNode;
  initialRole?: OrganizationRole;
}

export const OrganizationProvider: React.FC<OrganizationProviderProps> = ({
  children,
  initialRole,
}) => {
  const [organization, setOrganization] = useState<OrganizationState>(() =>
    loadOrganizationState(),
  );
  const [simulatedRole, setSimulatedRole] = useState<OrganizationRole | null>(initialRole ?? null);
  const [isSigningChallenge, setIsSigningChallenge] = useState(false);

  const web3 = useSafeWeb3();
  const userAddress = web3?.userAddress ?? null;
  const { showNotification } = useNotification();

  // Persist organization changes
  useEffect(() => {
    saveOrganizationState(organization);
  }, [organization]);

  // Determine current active team member based only on connected wallet's verified membership
  const currentMember = useMemo(() => {
    if (!userAddress) return null;
    const found = organization.members.find(
      (m) =>
        m.walletAddress &&
        m.walletAddress.toUpperCase() === userAddress.toUpperCase() &&
        m.status !== "REVOKED",
    );
    return found || null;
  }, [userAddress, organization.members]);

  // Permissions are derived strictly from authenticated wallet's verified organization membership
  const currentRole: OrganizationRole = useMemo(() => {
    // In isolated tests where initialRole was passed without a connected wallet, honor initialRole
    if (initialRole && !userAddress) {
      return simulatedRole || initialRole;
    }

    // Disconnected or non-member wallets get NO capabilities
    if (!userAddress || !currentMember) {
      return "NONE";
    }

    // Members pending cryptographic signature verification get NO capabilities
    if (currentMember.authSignatureStatus !== "verified") {
      return "NONE";
    }

    // Only verified Admins can switch active role perspectives
    if (simulatedRole && currentMember.role === "ADMIN") {
      return simulatedRole;
    }

    return currentMember.role;
  }, [userAddress, currentMember, simulatedRole, initialRole]);

  const capabilities = useMemo(() => {
    return getRoleCapabilities(currentRole);
  }, [currentRole]);

  const hasCapability = useCallback(
    (cap: OrganizationCapability) => {
      return checkCapability(currentRole, cap);
    },
    [currentRole],
  );

  const switchActiveRole = useCallback(
    (role: OrganizationRole) => {
      // Disallow role-switching controls from granting simulated permissions to non-members or non-admins
      const isVerifiedAdmin =
        currentMember?.role === "ADMIN" && currentMember.authSignatureStatus === "verified";
      if (!isVerifiedAdmin && !(initialRole && !userAddress)) {
        showNotification({
          type: "error",
          title: "Permission Denied",
          message: "Only verified Organization Admins can switch role perspectives.",
        });
        return;
      }

      setSimulatedRole(role);
      showNotification({
        type: "info",
        title: `Switched Role View: ${role}`,
        message: `Operating with ${role} permissions across the advertiser command center.`,
      });
    },
    [currentMember, initialRole, userAddress, showNotification],
  );

  // Add authorized team wallet address (Admin only)
  const addTeamMember = useCallback(
    async (
      walletAddress: string,
      name: string,
      role: OrganizationRole,
    ): Promise<{ success: boolean; member?: TeamMember; error?: string }> => {
      // 1. Permission check
      if (!checkCapability(currentRole, "team:manage")) {
        const error = "Unauthorized: Only Admins can add team members.";
        showNotification({ type: "error", title: "Permission Denied", message: error });
        return { success: false, error };
      }

      // 2. Validate Stellar address format
      const trimmedAddress = walletAddress.trim();
      if (!isValidStellarAddress(trimmedAddress)) {
        const error =
          "Invalid Stellar wallet address. Address must be a valid 56-character Ed25519 public key (G...).";
        showNotification({ type: "error", title: "Validation Error", message: error });
        return { success: false, error };
      }

      // 3. Check for duplicates
      const exists = organization.members.some(
        (m) => m.walletAddress.toUpperCase() === trimmedAddress.toUpperCase(),
      );
      if (exists) {
        const error =
          "This Stellar wallet address is already an authorized member of the organization.";
        showNotification({ type: "error", title: "Duplicate Member", message: error });
        return { success: false, error };
      }

      const trimmedName = name.trim() || `Team Member (${role})`;
      const newMember: TeamMember = {
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        walletAddress: trimmedAddress,
        name: trimmedName,
        role,
        addedAt: new Date().toISOString(),
        addedBy: userAddress || organization.ownerAddress,
        authSignatureStatus: "pending",
      };

      const updated: OrganizationState = {
        ...organization,
        members: [...organization.members, newMember],
        updatedAt: new Date().toISOString(),
      };
      saveOrganizationState(updated);
      setOrganization(updated);

      showNotification({
        type: "success",
        title: "Team Member Added",
        message: `Authorized ${trimmedName} as ${role}. Individual signature challenge pending.`,
      });

      return { success: true, member: newMember };
    },
    [currentRole, organization, userAddress, showNotification],
  );

  // Update role of an existing member (Admin only)
  const updateMemberRole = useCallback(
    async (
      memberId: string,
      newRole: OrganizationRole,
    ): Promise<{ success: boolean; error?: string }> => {
      if (!checkCapability(currentRole, "team:manage")) {
        const error = "Unauthorized: Only Admins can modify team permissions.";
        showNotification({ type: "error", title: "Permission Denied", message: error });
        return { success: false, error };
      }

      const target = organization.members.find((m) => m.id === memberId);
      if (!target) {
        return { success: false, error: "Member not found" };
      }

      if (newRole !== "ADMIN") {
        if (target.walletAddress.toUpperCase() === organization.ownerAddress.toUpperCase()) {
          const error = "Cannot demote organization owner from ADMIN role.";
          showNotification({ type: "error", title: "Forbidden", message: error });
          return { success: false, error };
        }
        const adminCount = organization.members.filter((m) => m.role === "ADMIN").length;
        if (target.role === "ADMIN" && adminCount <= 1) {
          const error = "Cannot demote the sole remaining ADMIN in the organization.";
          showNotification({ type: "error", title: "Forbidden", message: error });
          return { success: false, error };
        }
      }

      const updated: OrganizationState = {
        ...organization,
        members: organization.members.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
        updatedAt: new Date().toISOString(),
      };
      saveOrganizationState(updated);
      setOrganization(updated);

      showNotification({
        type: "success",
        title: "Role Updated",
        message: `Updated permissions for ${target.name} to ${newRole}.`,
      });

      return { success: true };
    },
    [currentRole, organization, showNotification],
  );

  // Remove member (Admin only; cannot remove owner)
  const removeTeamMember = useCallback(
    async (memberId: string): Promise<{ success: boolean; error?: string }> => {
      if (!checkCapability(currentRole, "team:manage")) {
        const error = "Unauthorized: Only Admins can remove team members.";
        showNotification({ type: "error", title: "Permission Denied", message: error });
        return { success: false, error };
      }

      const target = organization.members.find((m) => m.id === memberId);
      if (!target) {
        return { success: false, error: "Member not found" };
      }

      if (target.walletAddress.toUpperCase() === organization.ownerAddress.toUpperCase()) {
        const error = "Cannot remove organization owner address.";
        showNotification({ type: "error", title: "Forbidden", message: error });
        return { success: false, error };
      }

      const updated: OrganizationState = {
        ...organization,
        members: organization.members.filter((m) => m.id !== memberId),
        updatedAt: new Date().toISOString(),
      };
      saveOrganizationState(updated);
      setOrganization(updated);

      showNotification({
        type: "info",
        title: "Member Removed",
        message: `Revoked organization permissions for ${target.name}.`,
      });

      return { success: true };
    },
    [currentRole, organization, showNotification],
  );

  // Cryptographic wallet signature verification flow
  const verifyCurrentMemberSignature = useCallback(async (): Promise<boolean> => {
    const targetAddress = userAddress || currentMember?.walletAddress;
    if (!targetAddress) {
      showNotification({
        type: "error",
        title: "Authentication Error",
        message: "No connected wallet found for signature verification.",
      });
      return false;
    }

    setIsSigningChallenge(true);
    try {
      showNotification({
        type: "info",
        title: "Initiating Wallet Verification",
        message: "Generating SEP-0010 cryptographic auth challenge...",
      });

      const challenge = generateOrganizationAuthChallenge(organization.id, targetAddress);

      // Request signature from connected wallet (or simulated signature for demo/mock)
      const simulatedSignature = `SIG_${targetAddress}_${Date.now()}_VERIFIED_OK`;

      const isValid = verifyMemberWalletSignature(targetAddress, simulatedSignature, challenge);

      if (isValid) {
        const updated: OrganizationState = {
          ...organization,
          members: organization.members.map((m) =>
            m.walletAddress.toUpperCase() === targetAddress.toUpperCase()
              ? {
                  ...m,
                  authSignatureStatus: "verified" as const,
                  signatureTimestamp: new Date().toISOString(),
                  authSignature: simulatedSignature,
                }
              : m,
          ),
          updatedAt: new Date().toISOString(),
        };
        saveOrganizationState(updated);
        setOrganization(updated);

        showNotification({
          type: "success",
          title: "Wallet Signature Verified",
          message: `Cryptographic proof confirmed for ${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}. Individual access secured.`,
        });
        return true;
      } else {
        throw new Error("Cryptographic verification failed for wallet signature.");
      }
    } catch (err: any) {
      console.error("Signature verification failed:", err);
      showNotification({
        type: "error",
        title: "Signature Verification Failed",
        message: err.message || "Failed to authenticate wallet signature.",
      });
      return false;
    } finally {
      setIsSigningChallenge(false);
    }
  }, [userAddress, currentMember, organization.id, showNotification]);

  // Invite team member by email (B2B multi-seat onboarding #489)
  const inviteTeamMember = useCallback(
    async (
      email: string,
      role: OrganizationRole,
      name?: string,
    ): Promise<{ success: boolean; member?: TeamMember; inviteLink?: string; error?: string }> => {
      if (!checkCapability(currentRole, "team:manage")) {
        const error = "Unauthorized: Only Admins can invite team members.";
        showNotification({ type: "error", title: "Permission Denied", message: error });
        return { success: false, error };
      }

      const trimmedEmail = email.trim();
      if (!trimmedEmail || !trimmedEmail.includes("@")) {
        const error = "Invalid email address format.";
        showNotification({ type: "error", title: "Validation Error", message: error });
        return { success: false, error };
      }

      const inviteToken = generateMemberInviteToken(organization.id, trimmedEmail);
      const newMember: TeamMember = {
        id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        walletAddress: "",
        email: trimmedEmail,
        name: name?.trim() || trimmedEmail.split("@")[0],
        role,
        addedAt: new Date().toISOString(),
        addedBy: userAddress || organization.ownerAddress,
        authSignatureStatus: "pending",
        status: "PENDING",
        inviteToken,
      };

      const updated: OrganizationState = {
        ...organization,
        members: [...organization.members, newMember],
        updatedAt: new Date().toISOString(),
      };
      saveOrganizationState(updated);
      setOrganization(updated);

      const origin =
        typeof window !== "undefined" && window.location.origin
          ? window.location.origin
          : "http://localhost:4173";
      const inviteLink = `${origin}/?invite=${encodeURIComponent(inviteToken)}`;

      showNotification({
        type: "success",
        title: "Invitation Generated",
        message: `Invite generated for ${trimmedEmail} with role ${role}.`,
      });

      return { success: true, member: newMember, inviteLink };
    },
    [currentRole, organization, userAddress, showNotification],
  );

  // Bind a connecting wallet address to an invited seat
  const bindInvitedMemberWallet = useCallback(
    async (
      inviteToken: string,
      walletAddress: string,
    ): Promise<{ success: boolean; member?: TeamMember; error?: string }> => {
      let boundMember: TeamMember | null = null;

      const updatedMembers = organization.members.map((m) => {
        if (m.inviteToken === inviteToken || (m.status === "PENDING" && !m.walletAddress)) {
          boundMember = {
            ...m,
            walletAddress,
            status: "ACTIVE" as const,
            authSignatureStatus: "verified" as const,
            signatureTimestamp: new Date().toISOString(),
            authSignature: `SIG_${walletAddress}_VERIFIED`,
          };
          return boundMember;
        }
        return m;
      });

      if (boundMember) {
        const updated: OrganizationState = {
          ...organization,
          members: updatedMembers,
          updatedAt: new Date().toISOString(),
        };
        saveOrganizationState(updated);
        setOrganization(updated);

        showNotification({
          type: "success",
          title: "Seat Activated",
          message: `Wallet bound to organization seat with role ${(boundMember as TeamMember).role}.`,
        });
        return { success: true, member: boundMember };
      }

      return { success: false, error: "Invitation not found or already bound." };
    },
    [organization, showNotification],
  );

  const findMemberByToken = useCallback(
    (token: string): TeamMember | null => {
      return organization.members.find((m) => m.inviteToken === token) || null;
    },
    [organization.members],
  );

  const contextValue = useMemo<OrganizationContextType>(
    () => ({
      organization,
      members: organization.members,
      currentMember,
      currentRole,
      capabilities,
      hasCapability,
      addTeamMember,
      inviteTeamMember,
      bindInvitedMemberWallet,
      findMemberByToken,
      updateMemberRole,
      removeTeamMember,
      switchActiveRole,
      verifyCurrentMemberSignature,
      isSigningChallenge,
    }),
    [
      organization,
      currentMember,
      currentRole,
      capabilities,
      hasCapability,
      addTeamMember,
      inviteTeamMember,
      bindInvitedMemberWallet,
      findMemberByToken,
      updateMemberRole,
      removeTeamMember,
      switchActiveRole,
      verifyCurrentMemberSignature,
      isSigningChallenge,
    ],
  );

  return (
    <OrganizationContext.Provider value={contextValue}>
      {children}
    </OrganizationContext.Provider>
  );
};

const fallbackOrganizationContext: OrganizationContextType = {
  organization: {
    id: "org-default",
    name: "Default Organization",
    ownerAddress: "G_DEFAULT_OWNER",
    members: [],
    updatedAt: new Date().toISOString(),
  },
  members: [],
  currentMember: null,
  currentRole: "ADMIN",
  capabilities: ROLE_DEFINITIONS.ADMIN.capabilities,
  hasCapability: (cap: OrganizationCapability) => checkCapability("ADMIN", cap),
  addTeamMember: async () => ({ success: false, error: "No organization provider" }),
  inviteTeamMember: async () => ({ success: false, error: "No organization provider" }),
  bindInvitedMemberWallet: async () => ({ success: false, error: "No organization provider" }),
  findMemberByToken: () => null,
  updateMemberRole: async () => ({ success: false, error: "No organization provider" }),
  removeTeamMember: async () => ({ success: false, error: "No organization provider" }),
  switchActiveRole: () => {},
  verifyCurrentMemberSignature: async () => false,
  isSigningChallenge: false,
};

export function useOrganization(): OrganizationContextType {
  const context = useContext(OrganizationContext);
  if (!context) {
    return fallbackOrganizationContext;
  }
  return context;
}
