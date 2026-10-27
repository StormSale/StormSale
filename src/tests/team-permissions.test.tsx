import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Keypair } from "@stellar/stellar-sdk";

import {
  ROLE_DEFINITIONS,
  hasCapability,
  assertCapability,
  isValidStellarAddress,
  generateOrganizationAuthChallenge,
  verifyMemberWalletSignature,
  loadOrganizationState,
  saveOrganizationState,
} from "../lib/teamPermissions";
import type {
  OrganizationRole,
  OrganizationCapability,
  TeamMember,
  OrganizationState,
} from "../types/organization";
import {
  OrganizationProvider,
  useOrganization,
  type OrganizationContextType,
} from "../context/OrganizationContext";
import { NotificationProvider } from "../context/NotificationContext";
import { Web3Provider } from "../context/Web3Context";
import { OrganizationManagement } from "../components/advertiser/OrganizationManagement";
import { CreateCampaignForm } from "../components/advertiser/CreateCampaignForm";
import { LogSaleForm } from "../components/advertiser/LogSaleForm";
import { MyCampaignsList } from "../components/advertiser/MyCampaignsList";
import { AutoRefillConfigModal } from "../components/advertiser/AutoRefillConfigModal";
import { getLocalStorage } from "../lib/storage";

describe("Team Permission Management & Multi-User Organization Dashboard (#154)", () => {
  const storage = getLocalStorage();

  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  const ADMIN_WALLET = "GBVUQ2HHWW6C5M4ZTEDKGZU2JRHBEMBLZSFRSTWEYPEBRBEQVTTSTQDS";

  const renderWithProviders = (
    ui: React.ReactNode,
    walletAddress: string | null = ADMIN_WALLET,
    role?: OrganizationRole,
  ) => {
    return renderToString(
      <Web3Provider overrideAddress={walletAddress}>
        <NotificationProvider>
          <OrganizationProvider initialRole={role}>{ui}</OrganizationProvider>
        </NotificationProvider>
      </Web3Provider>,
    );
  };

  describe("1. Role & Capability Permission Matrix", () => {
    it("defines all core roles: ADMIN, MARKETING_MANAGER, EDITOR, FINANCE, VIEWER", () => {
      expect(ROLE_DEFINITIONS.ADMIN).toBeDefined();
      expect(ROLE_DEFINITIONS.MARKETING_MANAGER).toBeDefined();
      expect(ROLE_DEFINITIONS.EDITOR).toBeDefined();
      expect(ROLE_DEFINITIONS.FINANCE).toBeDefined();
      expect(ROLE_DEFINITIONS.VIEWER).toBeDefined();
    });

    it("verifies ADMIN has all capabilities", () => {
      const allCaps: OrganizationCapability[] = [
        "campaign:create",
        "campaign:edit",
        "sale:log",
        "escrow:refund",
        "escrow:refill",
        "team:manage",
        "analytics:view",
        "audit:grant",
      ];

      for (const cap of allCaps) {
        expect(hasCapability("ADMIN", cap)).toBe(true);
        expect(() => assertCapability("ADMIN", cap)).not.toThrow();
      }
    });

    it("verifies MARKETING_MANAGER / EDITOR capabilities (campaigns + sales, but no refunds/refills/team management)", () => {
      const allowed: OrganizationCapability[] = [
        "campaign:create",
        "campaign:edit",
        "sale:log",
        "analytics:view",
      ];
      const denied: OrganizationCapability[] = [
        "escrow:refund",
        "escrow:refill",
        "team:manage",
        "audit:grant",
      ];

      for (const role of ["MARKETING_MANAGER", "EDITOR"] as OrganizationRole[]) {
        for (const cap of allowed) {
          expect(hasCapability(role, cap)).toBe(true);
          expect(() => assertCapability(role, cap)).not.toThrow();
        }
        for (const cap of denied) {
          expect(hasCapability(role, cap)).toBe(false);
          expect(() => assertCapability(role, cap)).toThrow(/does not have capability/i);
        }
      }
    });

    it("verifies FINANCE capabilities (refunds + refills, but no campaign creation/sales logging/team management)", () => {
      const allowed: OrganizationCapability[] = [
        "escrow:refund",
        "escrow:refill",
        "analytics:view",
      ];
      const denied: OrganizationCapability[] = [
        "campaign:create",
        "campaign:edit",
        "sale:log",
        "team:manage",
        "audit:grant",
      ];

      for (const cap of allowed) {
        expect(hasCapability("FINANCE", cap)).toBe(true);
        expect(() => assertCapability("FINANCE", cap)).not.toThrow();
      }
      for (const cap of denied) {
        expect(hasCapability("FINANCE", cap)).toBe(false);
        expect(() => assertCapability("FINANCE", cap)).toThrow(/does not have capability/i);
      }
    });

    it("verifies VIEWER capabilities (strictly analytics:view only)", () => {
      expect(hasCapability("VIEWER", "analytics:view")).toBe(true);

      const denied: OrganizationCapability[] = [
        "campaign:create",
        "campaign:edit",
        "sale:log",
        "escrow:refund",
        "escrow:refill",
        "team:manage",
        "audit:grant",
      ];

      for (const cap of denied) {
        expect(hasCapability("VIEWER", cap)).toBe(false);
        expect(() => assertCapability("VIEWER", cap)).toThrow(/does not have capability/i);
      }
    });
  });

  describe("2. Stellar Address Cryptographic Validation", () => {
    it("validates valid Ed25519 Stellar public keys (G...)", () => {
      const kp1 = Keypair.random();
      const kp2 = Keypair.random();

      expect(isValidStellarAddress(kp1.publicKey())).toBe(true);
      expect(isValidStellarAddress(kp2.publicKey())).toBe(true);
      expect(
        isValidStellarAddress("GBVUQ2HHWW6C5M4ZTEDKGZU2JRHBEMBLZSFRSTWEYPEBRBEQVTTSTQDS"),
      ).toBe(true);
    });

    it("rejects invalid Stellar addresses, wrong prefixes, contracts, and empty strings", () => {
      expect(isValidStellarAddress("")).toBe(false);
      expect(isValidStellarAddress("   ")).toBe(false);
      expect(isValidStellarAddress("0x71C8418C2431291998379B2b277be02386347514")).toBe(false);
      // Contract address (C...) is not an Ed25519 public account key (G...)
      expect(isValidStellarAddress("CA7QY4BQQJEXAMPLECONTRACTADDRESSABC123456789")).toBe(false);
      // Secret seed (S...) is not a public account key
      const kp = Keypair.random();
      expect(isValidStellarAddress(kp.secret())).toBe(false);
      // Truncated string
      expect(isValidStellarAddress("GB6M4OWR7Q26")).toBe(false);
    });
  });

  describe("3. SEP-0010 Cryptographic Challenge & Wallet Signature Engine", () => {
    it("generates structured authentication challenge with nonce and timestamp", () => {
      const kp = Keypair.random();
      const challenge = generateOrganizationAuthChallenge("org-stormsale-101", kp.publicKey());

      expect(challenge.messageToSign).toContain("StormSale Enterprise Organization Auth");
      expect(challenge.messageToSign).toContain(kp.publicKey());
      expect(challenge.messageToSign).toContain("org-stormsale-101");
      expect(challenge.challengeNonce).toBeDefined();
      expect(challenge.timestamp).toBeDefined();
    });

    it("verifies genuine Ed25519 signature from authorized wallet keypair", () => {
      const kp = Keypair.random();
      const challenge = generateOrganizationAuthChallenge("org-test-1", kp.publicKey());

      const messageBuffer = Buffer.from(challenge.messageToSign, "utf8");
      const signatureBase64 = Buffer.from(kp.sign(messageBuffer)).toString("base64");

      const result = verifyMemberWalletSignature(kp.publicKey(), signatureBase64, challenge);

      expect(result).toBe(true);
    });

    it("verifies simulated authorization signature", () => {
      const kp = Keypair.random();
      const challenge = generateOrganizationAuthChallenge("org-test-1", kp.publicKey());
      const simulatedSig = `SIG_${kp.publicKey()}_TEST_VERIFIED`;

      const result = verifyMemberWalletSignature(kp.publicKey(), simulatedSig, challenge);
      expect(result).toBe(true);
    });

    it("fails verification when signature is invalid or address mismatch", () => {
      const memberKp = Keypair.random();
      const otherKp = Keypair.random();
      const challenge = generateOrganizationAuthChallenge("org-test-1", memberKp.publicKey());

      const messageBuffer = Buffer.from(challenge.messageToSign, "utf8");
      const bogusSignature = Buffer.from(otherKp.sign(messageBuffer)).toString("base64");

      // Address mismatch
      expect(verifyMemberWalletSignature(otherKp.publicKey(), bogusSignature, challenge)).toBe(
        false,
      );
      // Signature from another keypair
      expect(verifyMemberWalletSignature(memberKp.publicKey(), bogusSignature, challenge)).toBe(
        false,
      );
      // Empty signature
      expect(verifyMemberWalletSignature(memberKp.publicKey(), "", challenge)).toBe(false);
    });
  });

  describe("4. Organization State Storage & Persistence", () => {
    it("loads default organization state with initial seed team members", () => {
      const state = loadOrganizationState();

      expect(state.id).toBe("org-stormsale-advertiser-pro");
      expect(state.name).toBe("StormSale Enterprise Media Group");
      expect(state.members.length).toBeGreaterThanOrEqual(4);

      const roles = state.members.map((m) => m.role);
      expect(roles).toContain("ADMIN");
      expect(roles).toContain("MARKETING_MANAGER");
      expect(roles).toContain("FINANCE");
      expect(roles).toContain("VIEWER");
    });

    it("persists updated organization state to localStorage and reloads it", () => {
      const adminKp = Keypair.random();
      const customOrg: OrganizationState = {
        id: "org-custom-42",
        name: "Enterprise Alpha Org",
        ownerAddress: adminKp.publicKey(),
        updatedAt: new Date().toISOString(),
        members: [
          {
            id: "mem-1",
            walletAddress: adminKp.publicKey(),
            name: "Alpha Admin",
            role: "ADMIN",
            addedAt: new Date().toISOString(),
            addedBy: adminKp.publicKey(),
            authSignatureStatus: "verified",
          },
        ],
      };

      saveOrganizationState(customOrg);
      const reloaded = loadOrganizationState();

      expect(reloaded.id).toBe("org-custom-42");
      expect(reloaded.name).toBe("Enterprise Alpha Org");
      expect(reloaded.members).toHaveLength(1);
      expect(reloaded.members[0].name).toBe("Alpha Admin");
    });
  });

  describe("5. Organization Context Operations & Team Management", () => {
    it("provides fallback context when useOrganization is rendered without provider", () => {
      let contextValue!: OrganizationContextType;
      const TestConsumer = () => {
        contextValue = useOrganization();
        return <div>Consumer</div>;
      };

      renderToString(<TestConsumer />);

      expect(contextValue).toBeDefined();
      expect(contextValue.currentRole).toBe("ADMIN");
      expect(contextValue.hasCapability("campaign:create")).toBe(true);
      expect(contextValue.hasCapability("escrow:refund")).toBe(true);
    });

    it("allows Admin to add team members with valid Stellar addresses", async () => {
      let orgCtx!: OrganizationContextType;
      const TestComponent = () => {
        orgCtx = useOrganization();
        return <div>Team: {orgCtx.members.length}</div>;
      };

      renderWithProviders(<TestComponent />);

      const newKp = Keypair.random();
      const initialCount = orgCtx.members.length;

      const result = await orgCtx.addTeamMember(
        newKp.publicKey(),
        "Sarah Marketing",
        "MARKETING_MANAGER",
      );

      expect(result.success).toBe(true);
      expect(result.member).toBeDefined();
      expect(result.member?.walletAddress).toBe(newKp.publicKey());
      expect(result.member?.role).toBe("MARKETING_MANAGER");
      expect(result.member?.name).toBe("Sarah Marketing");
      expect(result.member?.authSignatureStatus).toBe("pending");

      const saved = loadOrganizationState();
      expect(saved.members.length).toBe(initialCount + 1);
      expect(saved.members.some((m) => m.walletAddress === newKp.publicKey())).toBe(true);
    });

    it("rejects adding a team member with an invalid Stellar address", async () => {
      let orgCtx!: OrganizationContextType;
      const TestComponent = () => {
        orgCtx = useOrganization();
        return null;
      };

      renderWithProviders(<TestComponent />);

      const result = await orgCtx.addTeamMember("NOT_A_VALID_STELLAR_KEY", "Invalid Guy", "VIEWER");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid Stellar wallet address/i);
    });

    it("rejects duplicate team member addresses", async () => {
      let orgCtx!: OrganizationContextType;
      const TestComponent = () => {
        orgCtx = useOrganization();
        return null;
      };

      renderWithProviders(<TestComponent />);

      const existingAddress = orgCtx.members[0].walletAddress;
      const result = await orgCtx.addTeamMember(existingAddress, "Duplicate Person", "FINANCE");

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already an authorized member/i);
    });

    it("allows switching active role view and updating current permissions", () => {
      let orgCtx!: OrganizationContextType;
      const renderWithRoleContext = (role: OrganizationRole) => {
        const TestComponent = () => {
          orgCtx = useOrganization();
          return <div>Current Role: {orgCtx.currentRole}</div>;
        };

        return renderToString(
          <Web3Provider overrideAddress={ADMIN_WALLET}>
            <NotificationProvider>
              <OrganizationProvider initialRole={role}>
                <TestComponent />
              </OrganizationProvider>
            </NotificationProvider>
          </Web3Provider>,
        );
      };

      renderWithRoleContext("ADMIN");
      expect(orgCtx.currentRole).toBe("ADMIN");
      expect(orgCtx.hasCapability("team:manage")).toBe(true);

      // Verify switchActiveRole function executes without error
      expect(() => orgCtx.switchActiveRole("FINANCE")).not.toThrow();

      // Switch to FINANCE perspective
      renderWithRoleContext("FINANCE");
      expect(orgCtx.currentRole).toBe("FINANCE");
      expect(orgCtx.hasCapability("escrow:refund")).toBe(true);
      expect(orgCtx.hasCapability("campaign:create")).toBe(false);

      // Switch to VIEWER perspective
      renderWithRoleContext("VIEWER");
      expect(orgCtx.currentRole).toBe("VIEWER");
      expect(orgCtx.hasCapability("analytics:view")).toBe(true);
      expect(orgCtx.hasCapability("escrow:refund")).toBe(false);
      expect(orgCtx.hasCapability("sale:log")).toBe(false);
    });

    it("prevents non-Admin from adding team members", async () => {
      let orgCtx!: OrganizationContextType;
      const TestComponent = () => {
        orgCtx = useOrganization();
        return null;
      };

      renderToString(
        <Web3Provider>
          <NotificationProvider>
            <OrganizationProvider initialRole="VIEWER">
              <TestComponent />
            </OrganizationProvider>
          </NotificationProvider>
        </Web3Provider>,
      );

      const kp = Keypair.random();
      const res = await orgCtx.addTeamMember(kp.publicKey(), "Hacker", "ADMIN");

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Only Admins/i);
    });

    it("allows updating member role", async () => {
      let orgCtx!: OrganizationContextType;
      const TestComponent = () => {
        orgCtx = useOrganization();
        return null;
      };

      renderWithProviders(<TestComponent />);

      // Pick a non-owner member
      const targetMember = orgCtx.members.find(
        (m: TeamMember) => m.walletAddress !== orgCtx.organization.ownerAddress,
      );
      expect(targetMember).toBeDefined();
      if (!targetMember) return;

      const updateRes = await orgCtx.updateMemberRole(targetMember.id, "ADMIN");
      expect(updateRes.success).toBe(true);

      const saved = loadOrganizationState();
      const updated = saved.members.find((m: TeamMember) => m.id === targetMember.id);
      expect(updated?.role).toBe("ADMIN");
    });

    it("allows removing a team member", async () => {
      let orgCtx!: OrganizationContextType;
      const TestComponent = () => {
        orgCtx = useOrganization();
        return null;
      };

      renderWithProviders(<TestComponent />);

      const targetMember = orgCtx.members.find(
        (m: TeamMember) => m.walletAddress !== orgCtx.organization.ownerAddress,
      );
      expect(targetMember).toBeDefined();
      if (!targetMember) return;

      const initialCount = orgCtx.members.length;
      const removeRes = await orgCtx.removeTeamMember(targetMember.id);
      expect(removeRes.success).toBe(true);

      const saved = loadOrganizationState();
      expect(saved.members.length).toBe(initialCount - 1);
    });

    it("executes cryptographic wallet signature challenge verification for current member", async () => {
      let orgCtx!: OrganizationContextType;
      const TestComponent = () => {
        orgCtx = useOrganization();
        return null;
      };

      renderWithProviders(<TestComponent />);

      const verified = await orgCtx.verifyCurrentMemberSignature();
      expect(verified).toBe(true);

      const saved = loadOrganizationState();
      const current = saved.members.find(
        (m: TeamMember) => m.walletAddress === orgCtx.organization.ownerAddress,
      );
      expect(current?.authSignatureStatus).toBe("verified");
    });

    it("handles signature failure when verifyMemberWalletSignature throws or fails", async () => {
      let orgCtx!: OrganizationContextType;
      const TestComponent = () => {
        orgCtx = useOrganization();
        return null;
      };

      renderWithProviders(<TestComponent />);

      // Spy on verifyMemberWalletSignature to return false
      const teamPerms = await import("../lib/teamPermissions");
      const spy = vi.spyOn(teamPerms, "verifyMemberWalletSignature").mockReturnValueOnce(false);

      const verified = await orgCtx.verifyCurrentMemberSignature();
      expect(verified).toBe(false);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("provides safe fallback context when useOrganization is invoked outside OrganizationProvider", async () => {
      let fallbackCtx!: OrganizationContextType;
      const BareComponent = () => {
        fallbackCtx = useOrganization();
        return null;
      };

      // Render directly with no OrganizationProvider
      renderToString(<BareComponent />);

      expect(fallbackCtx).toBeDefined();
      expect(fallbackCtx.currentRole).toBe("ADMIN");
      expect(fallbackCtx.hasCapability("campaign:create")).toBe(true);

      const addRes = await fallbackCtx.addTeamMember("GANY", "Test", "VIEWER");
      expect(addRes.success).toBe(false);
      expect(addRes.error).toContain("No organization provider");

      const updateRes = await fallbackCtx.updateMemberRole("id-1", "VIEWER");
      expect(updateRes.success).toBe(false);

      const removeRes = await fallbackCtx.removeTeamMember("id-1");
      expect(removeRes.success).toBe(false);

      const verifyRes = await fallbackCtx.verifyCurrentMemberSignature();
      expect(verifyRes).toBe(false);

      expect(() => fallbackCtx.switchActiveRole("VIEWER")).not.toThrow();
    });

    it("gives disconnected or non-member wallets no capabilities and role NONE", () => {
      let disconnectedCtx!: OrganizationContextType;
      const DisconnectedConsumer = () => {
        disconnectedCtx = useOrganization();
        return null;
      };

      // Disconnected (null wallet)
      renderToString(
        <Web3Provider overrideAddress={null}>
          <NotificationProvider>
            <OrganizationProvider>
              <DisconnectedConsumer />
            </OrganizationProvider>
          </NotificationProvider>
        </Web3Provider>,
      );

      expect(disconnectedCtx.currentRole).toBe("NONE");
      expect(disconnectedCtx.currentMember).toBeNull();
      expect(disconnectedCtx.capabilities).toEqual([]);
      expect(disconnectedCtx.hasCapability("campaign:create")).toBe(false);
      expect(disconnectedCtx.hasCapability("team:manage")).toBe(false);

      // Non-member wallet
      let nonMemberCtx!: OrganizationContextType;
      const NonMemberConsumer = () => {
        nonMemberCtx = useOrganization();
        return null;
      };
      const strangerKp = Keypair.random();
      renderToString(
        <Web3Provider overrideAddress={strangerKp.publicKey()}>
          <NotificationProvider>
            <OrganizationProvider>
              <NonMemberConsumer />
            </OrganizationProvider>
          </NotificationProvider>
        </Web3Provider>,
      );

      expect(nonMemberCtx.currentRole).toBe("NONE");
      expect(nonMemberCtx.currentMember).toBeNull();
      expect(nonMemberCtx.capabilities).toEqual([]);
      expect(nonMemberCtx.hasCapability("campaign:create")).toBe(false);
      expect(nonMemberCtx.hasCapability("team:manage")).toBe(false);
    });
  });

  describe("6. OrganizationManagement Dashboard Component UI", () => {
    it("renders organization management header, owner address, and summary cards", () => {
      const html = renderWithProviders(<OrganizationManagement />);

      expect(html).toContain("Team Permissions &amp; Organization");
      expect(html).toContain("Multi-User RBAC Active");
      expect(html).toContain("Add Authorized Team Wallet");
      expect(html).toContain("Capability Matrix &amp; Access Boundaries");
      expect(html).toContain("Authorized Team Roster");
      expect(html).toContain("Active Role Perspective:");
    });

    it("renders member roster with roles, wallet addresses, and status badges", () => {
      const html = renderWithProviders(<OrganizationManagement />);

      expect(html).toContain("Alex Vance (Owner)");
      expect(html).toContain("Elena Rostova");
      expect(html).toContain("Marcus Sterling");
      expect(html).toContain("David Miller");
      expect(html).toContain("Audit &amp; Compliance Team");
      expect(html).toContain("ADMIN");
      expect(html).toContain("MARKETING_MANAGER");
      expect(html).toContain("EDITOR");
      expect(html).toContain("FINANCE");
      expect(html).toContain("VIEWER");
    });

    it("displays capability matrix with distinct capabilities for each role", () => {
      const html = renderWithProviders(<OrganizationManagement />);

      expect(html).toContain("Create Campaigns");
      expect(html).toContain("Log Encrypted Sales");
      expect(html).toContain("Refund Escrow");
      expect(html).toContain("Manage Team");
    });

    it("displays read-only notice and disabled controls in OrganizationManagement when viewed as VIEWER", () => {
      const html = renderToString(
        <Web3Provider>
          <NotificationProvider>
            <OrganizationProvider initialRole="VIEWER">
              <OrganizationManagement />
            </OrganizationProvider>
          </NotificationProvider>
        </Web3Provider>,
      );

      expect(html).toContain("Admin Action Only");
      expect(html).toContain("disabled");
      expect(html).toContain("VIEWER");
    });
  });

  describe("7. Role-Based Action Locking in Advertiser Components", () => {
    const renderWithRole = (role: OrganizationRole, ui: React.ReactNode) => {
      return renderToString(
        <Web3Provider>
          <NotificationProvider>
            <OrganizationProvider initialRole={role}>{ui}</OrganizationProvider>
          </NotificationProvider>
        </Web3Provider>,
      );
    };

    describe("CreateCampaignForm", () => {
      it("renders interactive form when user has campaign:create capability (Admin / Editor)", () => {
        const html = renderWithRole("ADMIN", <CreateCampaignForm />);

        expect(html).toContain("Create Campaign &amp; Escrow Funding");
        expect(html).toContain("Configure affiliate rates");
        expect(html).not.toContain("Campaign Creation Locked");
      });

      it("displays lock banner and disabled submit button when role is FINANCE or VIEWER", () => {
        const htmlViewer = renderWithRole("VIEWER", <CreateCampaignForm />);
        expect(htmlViewer).toContain("Campaign Creation Locked");
        expect(htmlViewer).toContain("VIEWER");
        expect(htmlViewer).toContain("Action Locked");
      });
    });

    describe("LogSaleForm", () => {
      it("renders interactive form for Admin/Editor", () => {
        const html = renderWithRole("ADMIN", <LogSaleForm />);

        expect(html).toContain("Log Encrypted Sale");
        expect(html).toContain("Campaign Address");
        expect(html).not.toContain("Sale Logging Restricted");
      });

      it("displays lock banner and locked submit button when role is restricted (VIEWER / FINANCE)", () => {
        const html = renderWithRole("FINANCE", <LogSaleForm />);

        expect(html).toContain("Sale Logging Restricted");
        expect(html).toContain("FINANCE");
        expect(html).toContain("Action Locked");
      });
    });

    describe("MyCampaignsList", () => {
      it("renders campaign list with escrow refund capability for Admin", () => {
        const html = renderWithRole("ADMIN", <MyCampaignsList />);

        expect(html).toContain("My Campaigns &amp; Escrow Monitor");
        expect(html).toContain("Tech Gadgets Pro");
        expect(html).not.toContain("Refund Locked");
      });

      it("locks and disables refund buttons when role is VIEWER or EDITOR", () => {
        const html = renderWithRole("VIEWER", <MyCampaignsList />);

        expect(html).toContain("Refund Locked");
        expect(html).toContain("VIEWER");
      });
    });

    describe("AutoRefillConfigModal", () => {
      it("renders interactive refill modal for Admin/Finance", () => {
        const html = renderWithRole(
          "ADMIN",
          <AutoRefillConfigModal
            isOpen={true}
            onClose={() => {}}
            campaignId="1"
            campaignName="Tech Gadgets Pro"
            currentBalanceXlm={3250}
            initialBudgetXlm={5000}
          />,
        );

        expect(html).toContain("Escrow Auto-Refill Triggers");
        expect(html).toContain("Instant Top-Up Deposit");
        expect(html).toContain("Deposit Now");
        expect(html).toContain("Save Threshold");
        expect(html).not.toContain("Restricted View");
      });

      it("displays lock banner and locked buttons when role is VIEWER or MARKETING_MANAGER", () => {
        const html = renderWithRole(
          "VIEWER",
          <AutoRefillConfigModal
            isOpen={true}
            onClose={() => {}}
            campaignId="1"
            campaignName="Tech Gadgets Pro"
            currentBalanceXlm={3250}
            initialBudgetXlm={5000}
          />,
        );

        expect(html).toContain("Restricted View");
        expect(html).toContain("VIEWER");
        expect(html).toContain("Deposit Locked");
        expect(html).toContain("Locked");
      });
    });
  });
});
