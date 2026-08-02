import { useState } from "react";
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
import { Eye, Shield, FileSearch, CheckCircle2, XCircle, Lock, Unlock } from "lucide-react";

export const VerifyAccess = () => {
  const [saleId, setSaleId] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedData, setDecryptedData] = useState<object | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { userAddress } = useWeb3();
  const { showNotification } = useNotification();

  const checkAccess = async () => {
    if (!saleId || !campaignAddress || !userAddress) {
      showNotification({
        type: "warning",
        title: "Missing Information",
        message: "Please fill all required fields",
      });
      return;
    }
    setIsChecking(true);
    setHasAccess(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const result = Math.random() > 0.3;
      setHasAccess(result);
      showNotification({
        type: result ? "success" : "warning",
        title: result ? "Access Granted" : "Access Denied",
        message: result
          ? "Your key is verified. You may now decrypt."
          : "Request access from the campaign advertiser.",
      });
    } catch (_err) {
      showNotification({
        type: "error",
        title: "Check Failed",
        message: "Unable to verify access rights",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleDecrypt = async () => {
    setIsDecrypting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const stubData = {
        saleId: saleId,
        customer: "Jane Doe",
        product: "Web3 Pro License",
        amount: "150.00 XLM",
        timestamp: new Date().toISOString(),
        metadata: "Referral code: STORM42",
      };
      setDecryptedData(stubData);
      setIsDialogOpen(true);
    } catch (_err) {
      showNotification({
        type: "error",
        title: "Decryption Failed",
        message: "Unable to decrypt sale data",
      });
    } finally {
      setIsDecrypting(false);
    }
  };

  const requestAccess = () => {
    showNotification({
      type: "info",
      title: "Access Requested",
      message: "Your request has been sent to the parties involved",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Verify Access Rights
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Check your cryptographic permissions for encrypted sale data
        </p>
      </div>

      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Eye className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Access Verification
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Enter the campaign address and sale ID to verify your decryption key
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-6">
          <InputGroup className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <InputField
                label="Campaign Address"
                description="The campaign contract address"
                required
              >
                <Input
                  value={campaignAddress}
                  onChange={(e) => setCampaignAddress(e.target.value)}
                  placeholder="0x742d35Cc6634C0532925a3b8..."
                  className="h-12 border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950"
                />
              </InputField>
              <InputField label="Sale ID" description="Unique identifier for the sale" required>
                <Input
                  type="number"
                  value={saleId}
                  onChange={(e) => setSaleId(e.target.value)}
                  placeholder="e.g., 1042"
                  className="h-12 border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950"
                />
              </InputField>
            </div>

            <Button
              onClick={checkAccess}
              disabled={isChecking}
              className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-lg rounded-xl shadow-md transition-all"
            >
              {isChecking ? (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying Cryptographic Signatures...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <FileSearch className="w-5 h-5" />
                  Verify Access Rights
                </div>
              )}
            </Button>
          </InputGroup>

          {/* Access Result */}
          {hasAccess !== null && (
            <div
              className={`mt-8 p-6 rounded-2xl border ${
                hasAccess
                  ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20"
                  : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20"
              }`}
            >
              <div className="flex items-start space-x-4">
                {hasAccess ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 mt-1 shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-bold text-lg text-indigo-900 dark:text-indigo-300">
                        Access Granted
                      </h4>
                      <p className="text-sm font-medium text-indigo-700 dark:text-indigo-400 mt-1">
                        Your cryptographic key has been verified. You may now decrypt and inspect
                        the sale data.
                      </p>
                      <Button
                        onClick={handleDecrypt}
                        disabled={isDecrypting}
                        className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl h-11 px-6"
                      >
                        {isDecrypting ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Decrypting...
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Unlock className="w-4 h-4" />
                            Decrypt & View Sale Data
                          </div>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="w-8 h-8 text-red-600 dark:text-red-400 mt-1 shrink-0" />
                    <div>
                      <h4 className="font-bold text-lg text-red-900 dark:text-red-300">
                        Access Denied
                      </h4>
                      <p className="text-sm font-medium text-red-700 dark:text-red-400 mt-1">
                        Your key does not have permission to decrypt this data payload.
                      </p>
                      <Button
                        onClick={requestAccess}
                        className="mt-4 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-semibold rounded-xl h-11 px-6"
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Request Escrowed Access
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security info */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-zinc-900 dark:text-white text-sm">
                NIST Compliance Notice
              </p>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                All audit access operations are logged permanently on-chain. Unauthorized decryption
                attempts may be reported under applicable compliance frameworks. Only access data
                you have been explicitly authorized to review.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Decrypted data dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
                <Unlock className="w-5 h-5 text-white" />
              </div>
              <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                Decrypted Sale Data
              </DialogTitle>
            </div>
            <DialogDescription className="text-zinc-500 dark:text-zinc-400">
              Verified sale #{saleId} · {campaignAddress.slice(0, 14)}...
            </DialogDescription>
          </DialogHeader>
          <div className="bg-slate-50 dark:bg-zinc-950 p-5 rounded-xl border border-slate-200 dark:border-zinc-800 mt-2">
            {decryptedData &&
              Object.entries(decryptedData).map(([key, val]) => (
                <div
                  key={key}
                  className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-zinc-800/50 last:border-0"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {key}
                  </span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white font-mono">
                    {String(val)}
                  </span>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
