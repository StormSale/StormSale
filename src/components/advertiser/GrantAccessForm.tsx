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
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { wrapAESKey, getPublicKeyForAddress } from "../../lib/crypto";
import { Eye, Shield, UserCheck } from "lucide-react";

export const GrantAccessForm = () => {
  const [saleId, setSaleId] = useState("");
  const [auditorAddress, setAuditorAddress] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { getCampaignContract } = useWeb3();
  const { showNotification } = useNotification();

  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleId || !auditorAddress || !campaignAddress) {
      showNotification({
        type: "warning",
        title: "Missing Information",
        message: "Please fill all required fields",
      });
      return;
    }

    setIsLoading(true);
    try {
      const campaignContract = getCampaignContract(campaignAddress);

      showNotification({
        type: "info",
        title: "Preparing Access",
        message: "Setting up auditor permissions...",
      });

      const auditorPublicKey = await getPublicKeyForAddress(auditorAddress);
      const auditorWrappedKey = await wrapAESKey({} as CryptoKey, auditorPublicKey);

      showNotification({
        type: "info",
        title: "Transaction Submitted",
        message: "Granting audit access...",
      });

      const tx = await campaignContract.grantAuditAccess(saleId, auditorAddress, auditorWrappedKey);

      await tx.wait();

      showNotification({
        type: "success",
        title: "Access Granted!",
        message: "Auditor can now access the encrypted sale data",
      });

      setSaleId("");
      setAuditorAddress("");
      setCampaignAddress("");
    } catch (error: any) {
      console.error("Error granting audit access:", error);
      showNotification({
        type: "error",
        title: "Access Grant Failed",
        message: error.message || "Failed to grant audit access",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Grant Audit Access
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Provide auditors with secure access to encrypted sale data
        </p>
      </div>

      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-6 pt-8 px-8">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Eye className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Auditor Access Control
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Grant secure data access to authorized auditors
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          <form onSubmit={handleGrantAccess}>
            <InputGroup className="space-y-8">
              <InputField
                label="Campaign Address"
                description="The campaign containing the sale data"
                required
              >
                <Input
                  value={campaignAddress}
                  onChange={(e) => setCampaignAddress(e.target.value)}
                  placeholder="CCAMPAIGN... (Soroban Contract Address or ID)"
                  className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                  required
                />
              </InputField>

              <div className="grid md:grid-cols-2 gap-6">
                <InputField
                  label="Sale ID"
                  description="The specific sale to grant access to"
                  required
                >
                  <Input
                    type="number"
                    min="1"
                    value={saleId}
                    onChange={(e) => setSaleId(e.target.value)}
                    placeholder="e.g., 123"
                    className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                    required
                  />
                </InputField>

                <InputField
                  label="Auditor Address"
                  description="The auditor's wallet address"
                  required
                >
                  <Input
                    value={auditorAddress}
                    onChange={(e) => setAuditorAddress(e.target.value)}
                    placeholder="GAUDITOR... (Stellar Public Key)"
                    className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                    required
                  />
                </InputField>
              </div>

              {/* Security Notice */}
              <div className="bg-indigo-50 dark:bg-indigo-500/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-500/20">
                <div className="flex items-start space-x-4">
                  <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mt-1" />
                  <div>
                    <h4 className="font-bold text-indigo-900 dark:text-indigo-300">
                      Security Notice
                    </h4>
                    <p className="text-sm font-medium text-indigo-700 dark:text-indigo-400 mt-2 leading-relaxed">
                      Only grant access to verified auditors. The auditor will be able to decrypt
                      and view the sale data using their private key. This action is permanently
                      recorded on-chain.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-lg font-bold shadow-lg rounded-xl transition-all"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Granting Access...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <UserCheck className="w-5 h-5" />
                    <span>Grant Audit Access</span>
                  </div>
                )}
              </Button>
            </InputGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
