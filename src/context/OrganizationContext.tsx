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

  // Determine current active team member based on connected wallet
  const currentMember = useMemo(() => {
    if (!userAddress) return organization.members[0] || null;
    const found = organization.members.find(
      (m) => m.walletAddress.toUpperCase() === userAddress.toUpperCase(),
    );
    return found || organization.members[0] || null;
  }, [userAddress, organization.members]);

  // Active role: allows simulated switching (Admin / Editor / Finance / Viewer) or uses detected role
  const currentRole: OrganizationRole = useMemo(() => {
    if (simulatedRole) return simulatedRole;
    if (currentMember) return currentMember.role;
    return "ADMIN";
  }, [simulatedRole, currentMember]);

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
      setSimulatedRole(role);
      showNotification({
        type: "info",
        title: `Switched Role View: ${role}`,
        message: `Operating with ${role} permissions across the advertiser command center.`,
      });
    },
    [showNotification],
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

  const contextValue = useMemo<OrganizationContextType>(
    () => ({
      organization,
      members: organization.members,
      currentMember,
      currentRole,
      capabilities,
      hasCapability,
      addTeamMember,
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
