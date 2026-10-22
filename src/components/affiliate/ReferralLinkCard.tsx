import { useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { Link2, Copy, Check } from "lucide-react";

export const ReferralLinkCard = () => {
  const { userAddress } = useWeb3();
  const [copied, setCopied] = useState(false);

  const referralLink = `${window.location.origin}/c/1?ref=${userAddress ?? ""}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy referral link:", error);
    }
  };

  return (
    <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
      <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Your Referral Link
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Share this link to earn commissions on every attributed sale.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <code
            data-testid="referral-link"
            className="flex-1 min-w-0 truncate px-4 py-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-300"
          >
            {referralLink}
          </code>
          <Button
            onClick={handleCopy}
            className="h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-semibold shrink-0"
          >
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied" : "Copy Link"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
