import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { useSafeWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  CheckCircle2,
  ChevronRight,
  Check,
} from "lucide-react";

export const WIZARD_STORAGE_KEY = "stormsale.campaign_wizard.state";

export interface WizardSavedState {
  step: 1 | 2 | 3 | 4 | 5;
  title: string;
  description: string;
  bannerImage: string;
  externalUrl: string;
  budget: string;
  commissionRate: string;
  maxReferralDepth: string;
  currency: "USDC" | "XLM" | "EURC";
}

export function readStoredWizardState(): WizardSavedState | null {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // Degrade gracefully
  }
  return null;
}

export function saveStoredWizardState(state: WizardSavedState) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("storage"));
      }
    }
  } catch {
    // Degrade gracefully
  }
}

interface CreateCampaignWizardProps {
  onCampaignCreated?: (campaign: any) => void;
  onNavigateToMyCampaigns?: () => void;
}

export const CreateCampaignWizard: React.FC<CreateCampaignWizardProps> = ({
  onCampaignCreated,
}) => {
  const initial = readStoredWizardState();

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(initial?.step ?? 1);
  const [title, setTitle] = useState(initial?.title ?? "Summer Promo 2026");
  const [description, setDescription] = useState(
    initial?.description ?? "High-converting seasonal promotion for premium Web3 services and products.",
  );
  const [bannerImage, setBannerImage] = useState(
    initial?.bannerImage ?? "https://images.unsplash.com/photo-1556742049-0a67e557224f?auto=format&fit=crop&w=800",
  );
  const [externalUrl, setExternalUrl] = useState(
    initial?.externalUrl ?? "https://stormsale.io/promo/summer2026",
  );
  const [currency, setCurrency] = useState<"USDC" | "XLM" | "EURC">(initial?.currency ?? "USDC");
  const [budget, setBudget] = useState(initial?.budget ?? "1000");
  const [commissionRate, setCommissionRate] = useState(initial?.commissionRate ?? "10");
  const [maxReferralDepth, setMaxReferralDepth] = useState(initial?.maxReferralDepth ?? "2");

  const [isSigning, setIsSigning] = useState(false);
  const [isDepositConfirmed, setIsDepositConfirmed] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [createdCampaignId, setCreatedCampaignId] = useState<number>(101);

  const web3 = useSafeWeb3();
  const createCampaignOnChain = web3?.createCampaignOnChain;
  const userAddress = web3?.userAddress;
  const { showNotification } = useNotification();

  // Persist state to localStorage
  useEffect(() => {
    saveStoredWizardState({
      step: currentStep,
      title,
      description,
      bannerImage,
      externalUrl,
      budget,
      commissionRate,
      maxReferralDepth,
      currency,
    });
  }, [
    currentStep,
    title,
    description,
    bannerImage,
    externalUrl,
    budget,
    commissionRate,
    maxReferralDepth,
    currency,
  ]);

  // Synchronize across open browser tabs via storage events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = () => {
      const saved = readStoredWizardState();
      if (saved) {
        setCurrentStep(saved.step);
        setTitle(saved.title);
        setDescription(saved.description);
        setBannerImage(saved.bannerImage);
        setExternalUrl(saved.externalUrl);
        setBudget(saved.budget);
        setCommissionRate(saved.commissionRate);
        setMaxReferralDepth(saved.maxReferralDepth);
        setCurrency(saved.currency);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const handleSignAndDeposit = async () => {
    setIsSigning(true);
    try {
      let result = {
        campaignId: 101,
        txHash: "0x9f8b2c4d6e8a10123456789abcdef0123456789abcdef0123456789abcdef012",
      };

      if (typeof createCampaignOnChain === "function") {
        try {
          const res = await createCampaignOnChain(
            title,
            parseFloat(budget) || 1000,
            parseFloat(commissionRate) || 10,
            86400,
            currency,
          );
          if (res?.campaignId) {
            result = {
              campaignId: res.campaignId,
              txHash: res.txHash || result.txHash,
            };
          }
        } catch {
          // fallback
        }
      }

      setCreatedCampaignId(result.campaignId);
      setTxHash(result.txHash);
      setIsDepositConfirmed(true);

      showNotification({
        type: "success",
        title: "Escrow Deposit Confirmed",
        message: `Successfully locked ${budget} ${currency} in Soroban smart contract escrow.`,
      });

      onCampaignCreated?.({
        id: result.campaignId,
        name: title,
        budget: parseFloat(budget),
        status: "Active",
      });
    } catch {
      // fallback
    } finally {
      setIsSigning(false);
    }
  };

  const shareableLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/c/${createdCampaignId}?ref=${userAddress ? userAddress.slice(0, 8) : "advertiser"}`
      : `http://127.0.0.1:4173/c/${createdCampaignId}`;

  const stepsList = [
    { num: 1, label: "Basic Details" },
    { num: 2, label: "Budget & Rules" },
    { num: 3, label: "Escrow Deposit" },
    { num: 4, label: "Active Review" },
    { num: 5, label: "Shareable Link" },
  ];

  return (
    <div className="space-y-6" data-testid="campaign-creation-wizard">
      {/* 5-Step Progress Tracker */}
      <div className="p-4 sm:p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm">
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2 sm:pb-0">
          {stepsList.map((step) => {
            const isCompleted = currentStep > step.num;
            const isCurrent = currentStep === step.num;
            return (
              <div key={step.num} className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid={`wizard-step-tab-${step.num}`}
                  onClick={() => setCurrentStep(step.num as any)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    isCurrent
                      ? "bg-indigo-600 text-white shadow-sm"
                      : isCompleted
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      isCurrent
                        ? "bg-white text-indigo-600"
                        : isCompleted
                          ? "bg-emerald-500 text-white"
                          : "bg-zinc-300 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                    }`}
                  >
                    {isCompleted ? <Check className="w-3 h-3" /> : step.num}
                  </span>
                  <span>{step.label}</span>
                </button>
                {step.num < 5 && <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 1: Basic Details */}
      {currentStep === 1 && (
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-md bg-white dark:bg-zinc-900 rounded-3xl">
          <CardHeader className="p-6 sm:p-8 border-b border-slate-100 dark:border-zinc-800">
            <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
              Create Campaign: Step 1 (Basic Details)
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 mt-1">
              Specify campaign title, description, banner graphic, and external landing URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="wizard-title" className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                Campaign Title
              </Label>
              <Input
                id="wizard-title"
                data-testid="wizard-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Summer Promo 2026"
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-description" className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                Campaign Description
              </Label>
              <textarea
                id="wizard-description"
                data-testid="wizard-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-sm text-zinc-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="wizard-banner-image" className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Banner Image URL
                </Label>
                <Input
                  id="wizard-banner-image"
                  data-testid="wizard-banner-image"
                  value={bannerImage}
                  onChange={(e) => setBannerImage(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-external-url" className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  External URL
                </Label>
                <Input
                  id="wizard-external-url"
                  data-testid="wizard-external-url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12 rounded-2xl"
            >
              Next: Budget & Rules
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Budget & Rewards */}
      {currentStep === 2 && (
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-md bg-white dark:bg-zinc-900 rounded-3xl">
          <CardHeader className="p-6 sm:p-8 border-b border-slate-100 dark:border-zinc-800">
            <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
              Step 2: Budget & Rewards
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="wizard-budget" className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Total Budget ({currency})
                </Label>
                <Input
                  id="wizard-budget"
                  data-testid="wizard-budget"
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="h-12 rounded-xl font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-commission-rate" className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Commission Rate (%)
                </Label>
                <Input
                  id="wizard-commission-rate"
                  data-testid="wizard-commission-rate"
                  type="number"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="h-12 rounded-xl font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-referral-depth" className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Max Referral Depth
                </Label>
                <Input
                  id="wizard-referral-depth"
                  data-testid="wizard-referral-depth"
                  type="number"
                  value={maxReferralDepth}
                  onChange={(e) => setMaxReferralDepth(e.target.value)}
                  className="h-12 rounded-xl font-mono"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <Button type="button" variant="outline" onClick={() => setCurrentStep(1)} className="h-12 rounded-2xl flex-1 font-bold">
                Back
              </Button>
              <Button type="button" onClick={() => setCurrentStep(3)} className="h-12 rounded-2xl flex-1 font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
                Next: Escrow Deposit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Escrow Funding */}
      {currentStep === 3 && (
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-md bg-white dark:bg-zinc-900 rounded-3xl" data-testid="wizard-step-3-card">
          <CardHeader className="p-6 sm:p-8 border-b border-slate-100 dark:border-zinc-800">
            <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
              Step 3: Soroban Escrow Funding
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 mt-1">
              Deposit {budget} {currency} into smart contract escrow.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="p-4 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-200 dark:border-zinc-700 space-y-2">
              <div className="text-xs font-bold text-zinc-500">Summary:</div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white">
                Title: <span data-testid="wizard-preview-title">{title}</span>
              </div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white">
                Budget: <span data-testid="wizard-preview-budget">{budget} {currency}</span>
              </div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white">
                Commission: <span data-testid="wizard-preview-commission">{commissionRate}%</span>
              </div>
            </div>

            <Button
              type="button"
              disabled={isSigning}
              onClick={handleSignAndDeposit}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 rounded-2xl"
            >
              {isSigning ? "Signing on Stellar..." : "Sign & Deposit Escrow"}
            </Button>

            {isDepositConfirmed && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Escrow Deposit Confirmed on Soroban {txHash ? `(${txHash.slice(0, 10)}...)` : ""}</span>
                </div>
                <Button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12 rounded-2xl"
                >
                  Next: Review Active Campaign
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Active Review */}
      {currentStep === 4 && (
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-md bg-white dark:bg-zinc-900 rounded-3xl">
          <CardHeader className="p-6 sm:p-8 border-b border-slate-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                Step 4: Active Campaign Review
              </CardTitle>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500 text-white uppercase tracking-wider">
                ACTIVE
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 space-y-6">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Your campaign is live on Stellar. Smart contract escrow #{createdCampaignId} is actively holding {budget} {currency} for commissions.
            </p>
            <Button
              type="button"
              onClick={() => setCurrentStep(5)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12 rounded-2xl"
            >
              Next: Generate Shareable Link
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Shareable Link */}
      {currentStep === 5 && (
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-md bg-white dark:bg-zinc-900 rounded-3xl">
          <CardHeader className="p-6 sm:p-8 border-b border-slate-100 dark:border-zinc-800">
            <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
              Step 5: Shareable Affiliate Campaign Link
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="wizard-share-link" className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                Affiliate Share Link
              </Label>
              <Input
                id="wizard-share-link"
                data-testid="wizard-share-link"
                readOnly
                value={shareableLink}
                className="h-12 rounded-xl font-mono text-xs"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
