
import { useState } from "react";
import { AuditorOverview } from "../components/auditor/AuditorOverview";
import { VerifyAccess } from "../components/auditor/VerifyAccess";
import { AuditHistory } from "../components/auditor/AuditHistory";
import { ComplianceReport } from "../components/auditor/ComplianceReport";
import { MerkleTreeVisualizer } from "../components/auditor/MerkleTreeVisualizer";
import { Soc2EvidenceExport } from "../components/auditor/Soc2EvidenceExport";
import { NetworkRiskVisualizer } from "../components/auditor/NetworkRiskVisualizer";
import { Sidebar } from "../components/shared/Sidebar";
import { NotificationProvider } from "../context/NotificationContext";
import { usePreference } from "../hooks/usePreference";
import {
  AuditorTenancyProvider,
  useAuditorTenancy,
} from "../context/AuditorTenancyContext";
import {
  BarChart3,
  Eye,
  ClipboardList,
  FileCheck,
  GitFork,
  ShieldCheck,
  Network,
  Building2,
  KeyRound,
  Lock,
} from "lucide-react";
import { PrivacyVerification } from "../components/auditor/PrivacyVerification";
import { motion, AnimatePresence } from "framer-motion";

interface AuditorProps {
  onBack: () => void;
}

const AUDITOR_TABS = [
  "overview",
  "verify",
  "history",
  "compliance",
  "network",
  "soc2",
  "merkle",
  "privacy",
] as const;

type AuditorTab = (typeof AUDITOR_TABS)[number];

/**
 * Organization tenancy selector (Issue #189). Lives in the auditor navigation
 * so every tab below is visibly scoped to one read-only organization.
 */
const TenantSelector = () => {
  const { org, organizations, switchTenant, cachedKeyIds } =
    useAuditorTenancy();

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-6 p-4 bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          <Building2 className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">
            Organization scope
          </span>
        </div>

        {organizations.map((candidate) => {
          const isActive = candidate.id === org.id;

          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => switchTenant(candidate.id)}
              aria-pressed={isActive}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${
                isActive
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                  : "bg-slate-50 dark:bg-zinc-950/50 border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-indigo-300 dark:hover:border-indigo-500/40"
              }`}
            >
              {candidate.shortName}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-[11px] font-bold text-amber-700 dark:text-amber-400">
          <Eye className="w-3.5 h-3.5" />
          Read-only scope
        </span>

        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
          {cachedKeyIds.length > 0 ? (
            <KeyRound className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
          )}
          {cachedKeyIds.length} session key
          {cachedKeyIds.length === 1 ? "" : "s"}
          {" · "}
          {org.name}
        </span>
      </div>
    </div>
  );
};

const AuditorContent: React.FC<AuditorProps> = ({ onBack }) => {
  const { org } = useAuditorTenancy();

  const [activeTab, setActiveTab] = usePreference<AuditorTab>(
    "stormsale.auditor.tab",
    "overview",
    (value) => AUDITOR_TABS.includes(value as AuditorTab),
  );

  const [merkleTargetSaleId, setMerkleTargetSaleId] = useState<
    string | undefined
  >(undefined);

  const tabs = [
    { id: "overview", label: "Dashboard Overview", icon: BarChart3 },
    { id: "merkle", label: "Merkle Tree Proofs", icon: GitFork },
    { id: "verify", label: "Verify Access", icon: Eye },
    { id: "history", label: "Audit History", icon: ClipboardList },
    { id: "compliance", label: "Compliance Report", icon: FileCheck },
    { id: "network", label: "Transaction Network", icon: Network },
    { id: "soc2", label: "SOC 2 Evidence", icon: ShieldCheck },
    { id: "privacy", label: "Privacy", icon: ShieldCheck },
  ];

  const handleTabChange = (tab: string) => {
    if (!AUDITOR_TABS.includes(tab as AuditorTab)) {
      return;
    }

    setMerkleTargetSaleId(undefined);
    setActiveTab(tab as AuditorTab);
  };

  const handleViewMerkleProof = (saleId: string) => {
    setMerkleTargetSaleId(saleId);
    setActiveTab("merkle");
  };

  const renderContent = () => {
    switch (activeTab) {
      case "merkle":
        return (
          <MerkleTreeVisualizer
            initialSaleId={merkleTargetSaleId}
            organizationId={org.id}
          />
        );

      case "verify":
        return <VerifyAccess />;

      case "history":
        return (
          <AuditHistory
            onTabChange={handleTabChange}
            onViewMerkleProof={handleViewMerkleProof}
          />
        );

      case "compliance":
        return <ComplianceReport />;

      case "network":
        return <NetworkRiskVisualizer />;

      case "soc2":
        return <Soc2EvidenceExport />;

      case "overview":
        return <AuditorOverview onTabChange={handleTabChange} />;

      case "privacy":
        return <PrivacyVerification />;
      default:
        return <AuditorOverview onTabChange={handleTabChange} />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        tabs={tabs}
        onBack={onBack}
        roleName="Auditor Enterprise"
      />

      <div className="flex-1 p-4 lg:p-8 lg:overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <TenantSelector />

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export const Auditor: React.FC<AuditorProps> = (props) => (
  <NotificationProvider>
    <AuditorTenancyProvider>
      <AuditorContent {...props} />
    </AuditorTenancyProvider>
  </NotificationProvider>
);
