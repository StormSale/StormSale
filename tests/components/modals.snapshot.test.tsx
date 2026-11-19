// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  dialogVariants,
} from "../../src/components/ui/dialog";
import { Button } from "../../src/components/ui/button";

const mockWeb3State = vi.hoisted(() => ({
  isRpcModalOpen: true,
  closeRpcModal: vi.fn(),
  activeRpcEndpoint: {
    id: "sdf-testnet",
    name: "Stellar SDF Testnet (Primary)",
    url: "https://soroban-testnet.stellar.org",
    type: "primary",
    isLocal: false,
    priority: 1,
    status: "healthy",
    latencyMs: 42,
    lastCheckedAt: "2026-03-01T12:00:00.000Z",
    consecutiveFailures: 0,
    totalRequests: 150,
    failedRequests: 0,
  },
  rpcEndpoints: [
    {
      id: "sdf-testnet",
      name: "Stellar SDF Testnet (Primary)",
      url: "https://soroban-testnet.stellar.org",
      type: "primary",
      isLocal: false,
      priority: 1,
      status: "healthy",
      latencyMs: 42,
      lastCheckedAt: "2026-03-01T12:00:00.000Z",
      consecutiveFailures: 0,
      totalRequests: 150,
      failedRequests: 0,
    },
    {
      id: "local-node",
      name: "Local Node RPC (BlockDAG / Standalone)",
      url: "http://localhost:8000/soroban/rpc",
      type: "local",
      isLocal: true,
      priority: 2,
      status: "degraded",
      latencyMs: 120,
      lastCheckedAt: "2026-03-01T12:00:00.000Z",
      consecutiveFailures: 1,
      totalRequests: 80,
      failedRequests: 2,
    },
  ],
  rpcFailoverHistory: [
    {
      id: "failover_1",
      timestamp: "2026-03-01T12:00:00.000Z",
      fromEndpointId: "local-node",
      fromUrl: "http://localhost:8000/soroban/rpc",
      toEndpointId: "sdf-testnet",
      toUrl: "https://soroban-testnet.stellar.org",
      reason: "Timeout after 5000ms",
      durationMs: 120,
    },
  ],
  rpcTimeoutMs: 5000,
  switchRpcEndpoint: vi.fn(),
  simulateRpcFailover: vi.fn(),
  checkRpcHealth: vi.fn(),
  addCustomRpcEndpoint: vi.fn(),

  // MultiSig Modal state
  isMultiSigModalOpen: true,
  closeMultiSigModal: vi.fn(),
  userAddress: "GBZXN7PIRZGNMHGA728RGRYA7XPO5CFSGSJAA5T6Q5WWC62MWFPZ4ES2",
  connectorType: "freighter",
  multiSigInfo: {
    address: "GBZXN7PIRZGNMHGA728RGRYA7XPO5CFSGSJAA5T6Q5WWC62MWFPZ4ES2",
    thresholds: { low: 1, medium: 2, high: 2 },
    signers: [
      { key: "GBZXN7PIRZGNMHGA728RGRYA7XPO5CFSGSJAA5T6Q5WWC62MWFPZ4ES2", weight: 1, role: "Owner" },
      {
        key: "GA2C5RFPE6GCKMY3US5PAB6UZLKIGAHWKXX2UJAET73KYIIZRVKMLVY7",
        weight: 1,
        role: "Co-Signer",
      },
    ],
    isMultiSig: true,
  },
  activeMultiSigXdr: "AAAAAG...",
  activeMultiSigDescription: "Approve 500 XLM Escrow Top-Up",

  // Connect Wallet Modal state
  isWalletModalOpen: true,
  closeWalletModal: vi.fn(),
  connectWallet: vi.fn(),
}));

vi.mock("../../src/hooks/useWeb3", () => ({
  useWeb3: () => mockWeb3State,
}));

vi.mock("../../src/context/WalletConnectContext", () => ({
  useWalletConnect: () => ({ connect: vi.fn() }),
}));

vi.mock("../../src/context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
  NotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../src/hooks/useOrganization", () => ({
  useOrganization: () => ({
    currentOrg: { id: "org_1", name: "Acme Corp" },
    hasCapability: () => true,
  }),
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mockqr") },
}));

vi.mock("framer-motion", () => {
  const MotionComponent = (props: any) => {
    const { initial, animate, exit, transition, ...rest } = props;
    return <div {...rest} />;
  };
  return {
    motion: new Proxy({}, { get: () => MotionComponent }),
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

import { RpcStatusModal } from "../../src/components/shared/RpcStatusModal";
import { MultiSigApprovalModal } from "../../src/components/shared/MultiSigApprovalModal";
import { ConnectWalletModal } from "../../src/components/shared/ConnectWalletModal";
import { AutoRefillConfigModal } from "../../src/components/advertiser/AutoRefillConfigModal";

describe("[Snapshot] UI Modal & Dialog Primitives (#90)", () => {
  describe("Dialog Sizing Variants", () => {
    const sizes = ["sm", "md", "lg", "xl", "full", "mobile-full"] as const;

    sizes.forEach((size) => {
      it(`matches snapshot for dialog size: "${size}"`, () => {
        const classes = dialogVariants({ size });
        expect(classes).toMatchSnapshot();

        const html = renderToString(
          <Dialog open>
            <DialogContent size={size} portalled={false} animated={false}>
              <DialogHeader>
                <DialogTitle>Dialog Size: {size}</DialogTitle>
                <DialogDescription>Testing sizing variant: {size}</DialogDescription>
              </DialogHeader>
              <div className="py-4">Dialog content body goes here.</div>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>,
        );
        expect(html).toMatchSnapshot();
      });
    });
  });

  describe("Dialog Component Structural Elements", () => {
    it("matches snapshot for dialog with custom styling and without close button", () => {
      const html = renderToString(
        <Dialog open>
          <DialogContent
            portalled={false}
            animated={false}
            showCloseButton={false}
            className="border-primary/50"
          >
            <DialogHeader>
              <DialogTitle>Alert Confirmation</DialogTitle>
              <DialogDescription>This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive">Delete Campaign</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      );
      expect(html).toMatchSnapshot();
    });
  });

  describe("Application Modals Baseline Testing", () => {
    it("matches snapshot for RpcStatusModal with healthy/degraded endpoints and failover history", () => {
      const html = renderToString(<RpcStatusModal />);
      expect(html).toMatchSnapshot();
    });

    it("matches snapshot for MultiSigApprovalModal with signers and pending transaction", () => {
      const html = renderToString(<MultiSigApprovalModal />);
      expect(html).toMatchSnapshot();
    });

    it("matches snapshot for ConnectWalletModal with supported connectors", () => {
      const html = renderToString(<ConnectWalletModal />);
      expect(html).toMatchSnapshot();
    });

    it("matches snapshot for AutoRefillConfigModal open with escrow parameters", () => {
      const html = renderToString(
        <AutoRefillConfigModal
          isOpen={true}
          onClose={() => {}}
          campaignId="1"
          campaignName="Summer Kickoff 2026"
          currentBalanceXlm={250}
          initialBudgetXlm={1000}
        />,
      );
      expect(html).toMatchSnapshot();
    });
  });
});
