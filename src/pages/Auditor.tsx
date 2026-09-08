import { useState } from "react";
import { AuditorOverview } from "../components/auditor/AuditorOverview";
import { VerifyAccess } from "../components/auditor/VerifyAccess";
import { AuditHistory } from "../components/auditor/AuditHistory";
import { ComplianceReport } from "../components/auditor/ComplianceReport";
import { Sidebar } from "../components/shared/Sidebar";
import { NotificationProvider } from "../context/NotificationContext";
import { BarChart3, Eye, ClipboardList, FileCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AuditorProps {
  onBack: () => void;
}

const AuditorContent: React.FC<AuditorProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "Dashboard Overview", icon: BarChart3 },
    { id: "verify", label: "Verify Access", icon: Eye },
    { id: "history", label: "Audit History", icon: ClipboardList },
    { id: "compliance", label: "Compliance Report", icon: FileCheck },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "verify":
        return <VerifyAccess />;
      case "history":
        return <AuditHistory />;
      case "compliance":
        return <ComplianceReport />;
      default:
        return <AuditorOverview />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabs}
        onBack={onBack}
        roleName="Auditor Enterprise"
      />

      {/* Main content */}
      <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
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
    <AuditorContent {...props} />
  </NotificationProvider>
);
