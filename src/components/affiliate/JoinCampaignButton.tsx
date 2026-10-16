import { useState, useCallback } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { Users, Zap, Shield, CheckCircle2 } from "lucide-react";

export interface JoinCampaignState {
  status: "idle" | "pending" | "confirmed";
  campaignAddress: string;
  txHash?: string;
}

const INITIAL_STATE: JoinCampaignState = {
  status: "idle",
  campaignAddress: "",
};

export const JoinCampaignButton = () => {
  const [campaignAddress, setCampaignAddress] = useState("");
  const [optimisticState, setOptimisticState] = useState<JoinCampaignState>({
    ...INITIAL_STATE,
  });
  const { factoryContract } = useWeb3();
  const { showNotification } = useNotification();

  const isPending = optimisticState.status === "pending";
  const isConfirmed = optimisticState.status === "confirmed";

  /**
   * Optimistic UI flow:
   *  1. On click, immediately flip the local state to "pending" (<50ms).
   *  2. Submit the transaction and wait for mining.
   *  3. On success -> "confirmed".
   *  4. On failure -> revert to the snapshoted prior state and surface the error.
   */
  const handleJoinCampaign = useCallback(async () => {
    if (!factoryContract || !campaignAddress) {
      return;
    }

    // Snapshot the current state so we can revert on failure.
    const snapshot: JoinCampaignState = {
      ...optimisticState,
      campaignAddress,
    };

    // 1. Instant optimistic update (<50ms).
    setOptimisticState({
      status: "pending",
      campaignAddress,
    });

    try {
      const tx = await factoryContract.joinCampaign(campaignAddress);
      const txHash = tx.address ?? tx.hash ?? "";
      setOptimisticState({
        status: "pending",
        campaignAddress,
        txHash,
      });

      await tx.wait();

      // 2. Confirmed on-chain.
      setOptimisticState({
        status: "confirmed",
        campaignAddress,
        txHash,
      });
      showNotification({
        type: "success",
        title: "Campaign Joined!",
        message: "You have successfully joined the affiliate campaign.",
      });
      setCampaignAddress("");
    } catch (error: any) {
      console.error("Error joining campaign:", error);

      // 3. Reliable revert on txn failure.
      setOptimisticState(snapshot);
      showNotification({
        type: "error",
        title: "Failed to Join",
        message: error?.message || "Error joining campaign",
      });
    }
  }, [factoryContract, campaignAddress, optimisticState, showNotification]);

  const handleReset = useCallback(() => {
    setOptimisticState({ ...INITIAL_STATE });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Join Campaign
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Enter a campaign contract address to register as an affiliate
        </p>
      </div>

      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl max-w-2xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Users className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Join Affiliate Program
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Connect your wallet to register on-chain and start earning commissions
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-6 space-y-6">
          <div className="space-y-3">
            <Label
              htmlFor="campaignAddress"
              className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider"
            >
              Campaign Contract Address
            </Label>
            <Input
              id="campaignAddress"
              value={campaignAddress}
              onChange={(e) => setCampaignAddress(e.target.value)}
              placeholder="CCAMPAIGN... (Soroban Contract Address or ID)"
              disabled={isPending || isConfirmed}
              className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950 font-mono"
            />
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Obtain the campaign address from the advertiser or StormSale marketplace.
            </p>
          </div>

          {/* Optimistic status banner */}
          {isPending && (
            <div className="bg-amber-50 dark:bg-amber-500/10 p-5 rounded-2xl border border-amber-200 dark:border-amber-500/20">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-600 rounded-full animate-spin" />
                <p className="font-bold text-amber-900 dark:text-amber-300 text-sm">
                  Submitted - waiting for confirmation…
                </p>
              </div>
            </div>
          )}

          {isConfirmed && (
            <div className="bg-emerald-50 dark:bg-emerald-500/10 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-500/20">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <p className="font-bold text-emerald-900 dark:text-emerald-300 text-sm">
                  Confirmed on-chain.
                </p>
              </div>
            </div>
          )}

          {/* Info block */}
          <div className="bg-indigo-50 dark:bg-indigo-500/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-500/20">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-indigo-900 dark:text-indigo-300 text-sm">
                  What happens next?
                </p>
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400 mt-1 leading-relaxed">
                  Joining registers your wallet on-chain. The advertiser can then log encrypted
                  sales attributed to you, and you can claim commissions after the clearing period.
                </p>
              </div>
            </div>
          </div>

          {isConfirmed ? (
            <Button
              onClick={handleReset}
              className="w-full h-14 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white border border-slate-200 dark:border-zinc-800 font-bold text-lg rounded-xl shadow-sm transition-all"
            >
              Join Another Campaign
            </Button>
          ) : (
            <Button
              onClick={handleJoinCampaign}
              disabled={isPending || !campaignAddress}
              className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-lg rounded-xl shadow-md transition-all"
            >
              {isPending ? (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Joining Campaign...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Join Campaign
                </div>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
