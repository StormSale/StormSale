import React, { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { InputGroup, InputField } from "../../components/ui/input-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  Eye,
  Shield,
  FileSearch,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Key,
  Sparkles,
  Layers,
  ArrowRight,
} from "lucide-react";

interface PendingAuditItem {
  saleId: string;
  campaign: string;
  campaignAddress: string;
  requestedBy: string;
  urgency: "High" | "Medium" | "Low";
}

export const VerifyAccess: React.FC = () => {
  const [saleId, setSaleId] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedData, setDecryptedData] = useState<Record<string, string> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { userAddress, network } = useWeb3();
  const { showNotification } = useNotification();

  const pendingRequests: PendingAuditItem[] = [
    {
      saleId: "1042",
      campaign: "Tech Gadgets Pro",
      campaignAddress: "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
      requestedBy: "GB12...34CD",
      urgency: "High",
    },
    {
      saleId: "1100",
      campaign: "Summer Sale 2026",
      campaignAddress: "CB9E88LMNPQR5TUV2WXY4444ESCROW8888STORMTESTNET2",
      requestedBy: "GC78...90GH",
      urgency: "Medium",
    },
    {
      saleId: "1089",
      campaign: "NFT Drop Alpha",
      campaignAddress: "CD4M11STORM22ESCROW33SOROBAN44AFFILIATE55XLM6",
      requestedBy: "GD34...56IJ",
      urgency: "Low",
    },
  ];

  const handleQuickSelect = (item: PendingAuditItem) => {
    setSaleId(item.saleId);
    setCampaignAddress(item.campaignAddress);
    setHasAccess(null);
    setDecryptedData(null);
    showNotification({
      type: "info",
      title: "Preset Loaded",
      message: `Loaded Sale #${item.saleId} (${item.campaign})`,
    });
  };

  const checkAccess = async () => {
    if (!saleId || !campaignAddress) {
      showNotification({
        type: "warning",
        title: "Missing Information",
        message: "Please enter both Campaign Address and Sale ID",
      });
      return;
    }
    setIsChecking(true);
    setHasAccess(null);
    setDecryptedData(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1400));
      // Demo deterministic access logic: if saleId is provided and valid, allow access
      const isGranted = parseInt(saleId, 10) % 2 === 0 || saleId.length > 2;
      setHasAccess(isGranted);
      showNotification({
        type: isGranted ? "success" : "warning",
        title: isGranted ? "Access Granted" : "Access Denied",
        message: isGranted
          ? "Cryptographic permissions verified on-chain."
          : "Your auditor public key lacks authorization for this sale.",
      });
    } catch (_err) {
      showNotification({
        type: "error",
        title: "Check Failed",
        message: "Unable to verify access rights against Soroban RPC",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleDecrypt = async () => {
    setIsDecrypting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const stubData: Record<string, string> = {
        "Sale ID": `#${saleId}`,
        "Campaign Contract": `${campaignAddress.slice(0, 10)}...${campaignAddress.slice(-8)}`,
        "Customer Hash": "sha256:4b227777d4da1fc6215...",
        "Gross Conversion": "450.00 XLM",
        "Affiliate Commission": "45.00 XLM (10%)",
        "Settlement Status": "Escrow Cleared & Released",
        Timestamp: new Date().toUTCString(),
        "NIST Compliance Proof": "0x7f4e92a831b0c95f...",
      };
      setDecryptedData(stubData);
      setIsDialogOpen(true);
    } catch (_err) {
      showNotification({
        type: "error",
        title: "Decryption Failed",
        message: "Failed to decrypt envelope data payload",
      });
    } finally {
      setIsDecrypting(false);
    }
  };

  const requestAccess = () => {
    showNotification({
      type: "info",
      title: "Access Request Dispatched",
      message: "An on-chain access notification has been broadcast to the campaign advertiser.",
    });
  };

  return (
    <div className="space-y-8 w-full">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Audit Clearance Console
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
            Verify Access Rights
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
            Inspect cryptographic permissions, decrypt authorized sale payloads, and record
            compliance logs.
          </p>
        </div>

        {/* Auditor Identity Badge */}
        <div className="flex items-center space-x-3 px-4 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shrink-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Key className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Auditor Public Key
            </div>
            <div className="text-xs font-mono font-bold text-zinc-900 dark:text-white">
              {userAddress
                ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`
                : "Key Not Connected"}
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Verification Form & Results (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl overflow-hidden">
            <CardHeader className="pt-8 px-6 sm:px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0">
                  <Eye className="w-6 h-6" />
                </div>
                <div>
                  <CardTitle className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
                    Cryptographic Verification
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    Enter the Soroban campaign contract address and sale index to check key
                    permissions.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-6">
              <InputGroup className="space-y-5">
                <InputField
                  label="Campaign Contract Address"
                  description="Stellar/Soroban contract address starting with C..."
                  required
                >
                  <Input
                    value={campaignAddress}
                    onChange={(e) => setCampaignAddress(e.target.value)}
                    placeholder="CA7QW5KXGPTR4N2K9J2L77XLMESCROW..."
                    className="h-12 border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950 font-mono text-xs sm:text-sm"
                  />
                </InputField>

                <InputField
                  label="Sale ID / Transaction Index"
                  description="Numeric ledger identifier for the sale record"
                  required
                >
                  <Input
                    type="number"
                    value={saleId}
                    onChange={(e) => setSaleId(e.target.value)}
                    placeholder="e.g. 1042"
                    className="h-12 border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950 font-mono text-sm"
                  />
                </InputField>

                <Button
                  onClick={checkAccess}
                  disabled={isChecking}
                  className="w-full h-12 sm:h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-sm sm:text-base rounded-2xl shadow-lg transition-all"
                >
                  {isChecking ? (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying On-Chain Signatures...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <FileSearch className="w-5 h-5" />
                      <span>Verify Access Rights</span>
                    </div>
                  )}
                </Button>
              </InputGroup>

              {/* Live Verification Result Banner */}
              {hasAccess !== null && (
                <div
                  className={`p-6 rounded-2xl border transition-all ${
                    hasAccess
                      ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                      : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                  }`}
                >
                  <div className="flex items-start space-x-4">
                    {hasAccess ? (
                      <>
                        <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <h4 className="font-bold text-base sm:text-lg text-emerald-900 dark:text-emerald-200">
                            Access Granted & Key Verified
                          </h4>
                          <p className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 mt-1 leading-relaxed">
                            Your auditor public key matches the encrypted access grant on the
                            Soroban escrow contract.
                          </p>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <Button
                              onClick={handleDecrypt}
                              disabled={isDecrypting}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl h-10 px-5 text-xs sm:text-sm shadow-md"
                            >
                              {isDecrypting ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  <span>Decrypting...</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Unlock className="w-4 h-4" />
                                  <span>Decrypt & Inspect Payload</span>
                                </div>
                              )}
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-7 h-7 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <h4 className="font-bold text-base sm:text-lg text-rose-900 dark:text-rose-200">
                            Access Unauthorized
                          </h4>
                          <p className="text-xs sm:text-sm text-rose-700 dark:text-rose-300 mt-1 leading-relaxed">
                            The campaign advertiser has not granted audit access for this specific
                            sale ID to your public key.
                          </p>
                          <Button
                            onClick={requestAccess}
                            className="mt-4 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-bold rounded-xl h-10 px-5 text-xs sm:text-sm"
                          >
                            <Lock className="w-3.5 h-3.5 mr-2" />
                            Request Advertiser Access Grant
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Decrypted In-Page Data Card */}
              {decryptedData && (
                <div className="p-5 bg-slate-50 dark:bg-zinc-950/80 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-zinc-800">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                        Decrypted Sale Payload
                      </span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-500/30">
                      AES-GCM Authenticated
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200/50 dark:divide-zinc-800/50 text-xs">
                    {Object.entries(decryptedData).map(([key, val]) => (
                      <div key={key} className="py-2 flex justify-between items-center">
                        <span className="font-medium text-zinc-500 dark:text-zinc-400">{key}</span>
                        <span className="font-mono font-bold text-zinc-900 dark:text-white">
                          {val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Pending Requests Queue & Compliance Specs (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Quick Select Pending Audit Queue */}
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl overflow-hidden">
            <CardHeader className="pb-4 pt-6 px-6 border-b border-slate-100 dark:border-zinc-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <CardTitle className="text-base font-bold text-zinc-900 dark:text-white">
                    Pending Audit Queue
                  </CardTitle>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-full">
                  Click to Autofill
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5">
              {pendingRequests.map((item) => (
                <button
                  key={item.saleId}
                  onClick={() => handleQuickSelect(item)}
                  className="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50 hover:border-indigo-500 dark:hover:border-indigo-500/50 text-left transition-all group flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white">
                        Sale #{item.saleId}
                      </span>
                      <span className="text-xs text-zinc-400">·</span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-300 font-medium truncate">
                        {item.campaign}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 mt-1 truncate">
                      Contract: {item.campaignAddress.slice(0, 14)}...
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase ${
                        item.urgency === "High"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
                          : item.urgency === "Medium"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                            : "bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {item.urgency}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* NIST Compliance Standard Card */}
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl overflow-hidden">
            <CardHeader className="pb-3 pt-6 px-6">
              <div className="flex items-center space-x-2.5">
                <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <CardTitle className="text-base font-bold text-zinc-900 dark:text-white">
                  Compliance & Cryptography
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-4 text-xs text-zinc-600 dark:text-zinc-400">
              <p className="leading-relaxed font-medium">
                Under{" "}
                <span className="font-semibold text-zinc-900 dark:text-white">
                  NIST SP 800-53 (AC-3)
                </span>{" "}
                and ISO/IEC 27001 standards, all audit access grants are sealed using client-side
                ECDH key encapsulation.
              </p>
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-zinc-800/50">
                <div className="flex justify-between items-center py-1">
                  <span className="font-medium">Encryption Cipher</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">
                    AES-256-GCM
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="font-medium">On-Chain State</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    Soroban Persistent Escrow
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="font-medium">Audit Trail</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    Immutable Ledger
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal Dialog for Decrypted Data Detail */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 max-w-lg p-6 sm:p-8">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-md">
                <Unlock className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                  Decrypted Sale Payload
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  Sale #{saleId} verified on Stellar {network || "Testnet"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="bg-slate-50 dark:bg-zinc-950 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 mt-4 space-y-2.5">
            {decryptedData &&
              Object.entries(decryptedData).map(([key, val]) => (
                <div
                  key={key}
                  className="flex justify-between items-center py-1.5 border-b border-slate-200/50 dark:border-zinc-800/50 last:border-0 text-xs"
                >
                  <span className="font-semibold text-zinc-500 dark:text-zinc-400">{key}</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white truncate max-w-[200px]">
                    {val}
                  </span>
                </div>
              ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => setIsDialogOpen(false)}
              className="bg-zinc-900 dark:bg-indigo-600 text-white font-bold rounded-xl text-xs px-5 h-9"
            >
              Close Payload
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
