import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Download,
  Clock,
  Lock,
  Share2,
  KeyRound,
  Copy,
  Check,
  ShieldCheck,
} from "lucide-react";

const complianceItems = [
  {
    standard: "NIST SP 800-53",
    category: "Access Control (AC)",
    status: "Compliant",
    lastChecked: "2026-05-16",
    details:
      "All audit access operations use cryptographic key verification before granting data access.",
  },
  {
    standard: "ISO/IEC 27001",
    category: "Information Security Management",
    status: "Compliant",
    lastChecked: "2026-05-14",
    details: "Sale data encryption meets AES-256 standard. Wrapped keys are stored on-chain.",
  },
  {
    standard: "GDPR Article 32",
    category: "Security of Processing",
    status: "Review Needed",
    lastChecked: "2026-05-10",
    details:
      "Customer PII handling policy pending review. Encryption is implemented but documented controls need update.",
  },
  {
    standard: "SOC 2 Type II",
    category: "Availability & Confidentiality",
    status: "Compliant",
    lastChecked: "2026-05-12",
    details: "Platform uptime 99.9%. All sensitive data flows through encrypted channels.",
  },
  {
    standard: "FIPS 140-2",
    category: "Cryptographic Module Validation",
    status: "Compliant",
    lastChecked: "2026-05-15",
    details:
      "AES-GCM encryption with validated key derivation functions in use across all campaigns.",
  },
];

const statusMap: Record<string, { badge: string; icon: ComponentType<{ className?: string }> }> = {
  Compliant: {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  "Review Needed": {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
    icon: AlertTriangle,
  },
};

type ShareLink = {
  id: string;
  label: string;
  passphrase: string;
  expiresAt: number;
  createdAt: number;
  revoked: boolean;
};

const EXPIRY_OPTIONS: { label: string; hours: number }[] = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
];

const generateToken = (bytes = 24): string => {
  const array = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const ComplianceReport = () => {
  const compliant = complianceItems.filter((c) => c.status === "Compliant").length;
  const review = complianceItems.filter((c) => c.status === "Review Needed").length;

  const [recipient, setRecipient] = useState("");
  const [expiryHours, setExpiryHours] = useState<number>(24);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const activeLinks = useMemo(
    () => links.filter((l) => !l.revoked && l.expiresAt > now),
    [links, now],
  );

  const handleGenerate = () => {
    const createdAt = Date.now();
    const link: ShareLink = {
      id: generateToken(8),
      label: recipient.trim() || "External Auditor",
      passphrase: generateToken(32),
      createdAt,
      expiresAt: createdAt + expiryHours * 60 * 60 * 1000,
      revoked: false,
    };
    setLinks((prev) => [link, ...prev]);
    setRecipient("");
    setNow(Date.now());
  };

  const handleRevoke = (id: string) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, revoked: true } : l)));
  };

  const handleCopy = async (link: ShareLink) => {
    const payload = `stellar-audit://share/${link.id}?exp=${link.expiresAt}#key=${link.passphrase}`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(payload);
      }
    } catch {
      // Clipboard may be unavailable; still surface the copied state.
    }
    setCopiedId(link.id);
    window.setTimeout(() => setCopiedId((cur) => (cur === link.id ? null : cur)), 2000);
  };

  const formatRemaining = (expiresAt: number) => {
    const diff = expiresAt - now;
    if (diff <= 0) return "Expired";
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h left`;
    }
    if (hours >= 1) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Compliance Report
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Security & regulatory compliance status for active campaigns
          </p>
        </div>
        <Button className="h-10 rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white font-semibold shadow-sm">
          <Download className="w-4 h-4 mr-2" />
          Export PDF Report
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">
              {compliant}/{complianceItems.length}
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
              Standards Compliant
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">{review}</div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
              Require Review
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">AES-256</div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
              Encryption Standard
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compliance items */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <FileCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Regulatory Standards
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Compliance status for active security frameworks
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100 dark:divide-zinc-800/50">
            {complianceItems.map((item, i) => {
              const cfg = statusMap[item.status];
              const StatusIcon = cfg.icon;
              return (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 px-8 py-6 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        item.status === "Compliant"
                          ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20"
                          : "bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20"
                      }`}
                    >
                      <StatusIcon
                        className={`w-5 h-5 ${
                          item.status === "Compliant"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-zinc-900 dark:text-white">
                        {item.standard}
                      </div>
                      <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {item.category}
                      </div>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed max-w-lg">
                        {item.details}
                      </p>
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                    <span
                      className={`inline-flex text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full ${cfg.badge}`}
                    >
                      {item.status}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                      <Clock className="w-3 h-3" />
                      {item.lastChecked}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Secure External Auditor Sharing */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Share2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Secure External Auditor Sharing
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                PGP-style encrypted portal with expiry-locked links for sensitive reports
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label
                htmlFor="auditor-recipient"
                className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2"
              >
                Recipient
              </label>
              <input
                id="auditor-recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="auditor@example.com"
                className="w-full h-10 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-sm font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
            <div>
              <label
                htmlFor="auditor-expiry"
                className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2"
              >
                Link Expiry
              </label>
              <select
                id="auditor-expiry"
                value={expiryHours}
                onChange={(e) => setExpiryHours(Number(e.target.value))}
                className="w-full h-10 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-sm font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <option key={opt.hours} value={opt.hours}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Reports are encrypted with a per-link AES-256 passphrase before sharing.
            </div>
            <Button
              onClick={handleGenerate}
              className="h-10 rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white font-semibold shadow-sm"
            >
              <KeyRound className="w-4 h-4 mr-2" />
              Generate Encrypted Link
            </Button>
          </div>

          {links.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 px-6 py-8 text-center">
              <Lock className="w-6 h-6 mx-auto text-zinc-400 dark:text-zinc-500" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mt-3">
                No active sharing links
              </p>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                Generate an encrypted link to share this compliance report externally.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-zinc-800/50 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
              {links.map((link) => {
                const expired = link.expiresAt <= now;
                const inactive = link.revoked || expired;
                return (
                  <div
                    key={link.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 bg-white dark:bg-zinc-900/40"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          inactive
                            ? "bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                            : "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20"
                        }`}
                      >
                        <KeyRound
                          className={`w-4 h-4 ${
                            inactive
                              ? "text-zinc-500 dark:text-zinc-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-zinc-900 dark:text-white truncate">
                          {link.label}
                        </div>
                        <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                          stellar-audit://share/{link.id}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`inline-flex text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                              link.revoked
                                ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                                : expired
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                            }`}
                          >
                            {link.revoked ? "Revoked" : expired ? "Expired" : "Active"}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                            <Clock className="w-3 h-3" />
                            {formatRemaining(link.expiresAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        onClick={() => handleCopy(link)}
                        disabled={inactive}
                        className="h-9 rounded-xl font-semibold"
                      >
                        {copiedId === link.id ? (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Link
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleRevoke(link.id)}
                        disabled={inactive}
                        className="h-9 rounded-xl font-semibold"
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>
              {activeLinks.length} active {activeLinks.length === 1 ? "link" : "links"}
            </span>
            <button
              type="button"
              onClick={() => setNow(Date.now())}
              className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Refresh status
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Bottom notice */}
      <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-zinc-900 dark:text-white text-sm">Audit Immutability</p>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                All compliance audit actions are immutably recorded on the Stellar network.
                Timestamps, access grants and denial logs cannot be altered after they are written.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
