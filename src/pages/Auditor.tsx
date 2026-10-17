import { useState, useMemo } from "react";
import { AuditorOverview } from "../components/auditor/AuditorOverview";
import { VerifyAccess } from "../components/auditor/VerifyAccess";
import { AuditHistory } from "../components/auditor/AuditHistory";
import { ComplianceReport } from "../components/auditor/ComplianceReport";
import { Sidebar } from "../components/shared/Sidebar";
import { NotificationProvider } from "../context/NotificationContext";
import { BarChart3, Eye, ClipboardList, FileCheck, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AuditorProps {
  onBack: () => void;
}

const AuditorContent: React.FC<AuditorProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [reportedAnomalies, setReportedAnomalies] = useState<string[]>([]);

  const redFlags = useMemo(
    () => [
      { id: "rf-wash-001", label: "Wash-trading pattern detected", severity: "high" },
      { id: "rf-rapid-002", label: "Rapid-claim burst detected", severity: "medium" },
    ],
    []
  );

  const handleReportAnomaly = (anomalyId: string) => {
    setReportedAnomalies((prev) =>
      prev.includes(anomalyId) ? prev : [...prev, anomalyId]
    );
  };

  const tabs = [
    { id: "overview", label: "Dashboard Overview", icon: BarChart3 },
    { id: "verify", label: "Verify Access", icon: Eye },
    { id: "history", label: "Audit History", icon: ClipboardList },
    { id: "compliance", label: "Compliance Report", icon: FileCheck },
    { id: "anomalies", label: "Anomalies", icon: AlertTriangle },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "verify":
        return <VerifyAccess />;
      case "history":
        return <AuditHistory />;
      case "compliance":
        return <ComplianceReport />;
      case "anomalies":
        return (
          <AuditorOverview
            onTabChange={setActiveTab}
            initialView="anomalies"
            onReportAnomaly={handleReportAnomaly}
            reportedAnomalies={reportedAnomalies}
          />
        );
      default:
        return (
          <AuditorOverview
            onTabChange={setActiveTab}
            onReportAnomaly={handleReportAnomaly}
            reportedAnomalies={reportedAnomalies}
          />
        );
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
      <div className="flex-1 p-4 lg:p-8 lg:overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <div className="mb-4 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                Red Flag Status
              </span>
            </div>
            <ul className="space-y-1">
              {redFlags.map((flag) => {
                const reported = reportedAnomalies.includes(flag.id);
                return (
                  <li
                    key={flag.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-red-700 dark:text-red-300">
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-2 ${
                          flag.severity === "high" ? "bg-red-600" : "bg-amber-500"
                        }`}
                      />
                      {flag.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleReportAnomaly(flag.id)}
                      disabled={reported}
                      className="px-2 py-0.5 rounded border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
                    >
                      {reported ? "Reported" : "Report"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
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
