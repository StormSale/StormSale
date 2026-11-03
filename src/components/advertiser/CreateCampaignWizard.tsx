import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card } from "../ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { SUPPORTED_ESCROW_ASSETS } from "../../config/stellar";
import type { SupportedEscrowAssetCode } from "../../config/stellar";
import { formatStellarAddress } from "../../lib/stellar";
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Save,
  Calculator,
  Coins,
  Target,
  FileText,
  ShieldCheck,
  Zap,
  Tag,
  RotateCcw,
} from "lucide-react";

// ==========================================
// Zod Validation Schema
// ==========================================

export const campaignWizardSchema = z.object({
  // Step 1: Basic Info
  name: z
    .string()
    .min(3, "Campaign name must be at least 3 characters")
    .max(80, "Campaign name must be under 80 characters"),
  targetUrl: z.string().url("Please enter a valid website URL (e.g. https://example.com)"),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(500, "Description must be under 500 characters"),
  brandName: z.string().min(2, "Brand name must be at least 2 characters"),

  // Step 2: Financials
  asset: z.enum(["XLM", "USDC", "EURC"] as const),
  budget: z.number().min(50, "Minimum escrow budget is 50 tokens"),
  commissionRate: z
    .number()
    .min(1, "Commission must be at least 1%")
    .max(60, "Commission cannot exceed 60%"),
  clearingPeriod: z
    .number()
    .min(1, "Clearing period must be at least 1 day")
    .max(60, "Clearing period cannot exceed 60 days"),

  // Step 3: Targeting & Tags
  category: z.string().min(2, "Please select a category"),
  tags: z.array(z.string()).min(1, "Please provide at least 1 category tag"),
  targetAudience: z.string().min(3, "Specify target channels or audience"),
  minAffiliateReputation: z
    .number()
    .min(0, "Reputation cannot be negative")
    .max(100, "Max reputation is 100"),
});

export type CampaignWizardFormData = z.infer<typeof campaignWizardSchema>;

const DRAFT_STORAGE_KEY = "stormsale_campaign_wizard_draft";

export const DEFAULT_WIZARD_VALUES: CampaignWizardFormData = {
  name: "",
  targetUrl: "",
  description: "",
  brandName: "",
  asset: "XLM",
  budget: 1000,
  commissionRate: 15,
  clearingPeriod: 7,
  category: "DeFi",
  tags: ["Web3", "Stellar"],
  targetAudience: "Global crypto natives, DeFi investors, tech creators",
  minAffiliateReputation: 25,
};

const CATEGORIES = [
  "DeFi",
  "Fintech",
  "SaaS",
  "Gaming",
  "E-Commerce",
  "AI & Analytics",
  "Security",
  "Education",
];

export const CreateCampaignWizard: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [tagInput, setTagInput] = useState<string>("");
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [createdCampaignSuccess, setCreatedCampaignSuccess] = useState<boolean>(false);
  const [hasLoadedDraft, setHasLoadedDraft] = useState<boolean>(false);

  const { userAddress } = useWeb3();
  const { showNotification } = useNotification();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    trigger,
    formState: { errors },
  } = useForm<CampaignWizardFormData>({
    resolver: zodResolver(campaignWizardSchema),
    defaultValues: DEFAULT_WIZARD_VALUES,
    mode: "onChange",
  });

  const formValues = watch();

  // Load draft from local storage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        reset(parsed);
        setHasLoadedDraft(true);
      }
    } catch (err) {
      console.warn("Failed to load draft from localStorage:", err);
    }
  }, [reset]);

  // Save draft
  const handleSaveDraft = () => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formValues));
      showNotification({
        type: "success",
        title: "Draft Saved",
        message: "Your campaign parameters have been saved to local draft.",
      });
    } catch {
      showNotification({
        type: "error",
        title: "Draft Error",
        message: "Could not save draft to local storage.",
      });
    }
  };

  const handleClearDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    reset(DEFAULT_WIZARD_VALUES);
    setHasLoadedDraft(false);
    showNotification({
      type: "info",
      title: "Draft Cleared",
      message: "Reset form to default values.",
    });
  };

  // Step Validation before Proceeding
  const handleNextStep = async () => {
    let isValid = false;
    if (currentStep === 1) {
      isValid = await trigger(["name", "targetUrl", "description", "brandName"]);
    } else if (currentStep === 2) {
      isValid = await trigger(["asset", "budget", "commissionRate", "clearingPeriod"]);
    } else if (currentStep === 3) {
      isValid = await trigger(["category", "tags", "targetAudience", "minAffiliateReputation"]);
    }

    if (isValid) {
      setCurrentStep((prev) => Math.min(4, prev + 1));
    } else {
      showNotification({
        type: "warning",
        title: "Validation Needed",
        message: "Please complete all required fields correctly before advancing.",
      });
    }
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  // Add / Remove Tags
  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    const currentTags = formValues.tags || [];
    if (!currentTags.includes(trimmed)) {
      setValue("tags", [...currentTags, trimmed], { shouldValidate: true });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = formValues.tags || [];
    setValue(
      "tags",
      currentTags.filter((t) => t !== tagToRemove),
      { shouldValidate: true },
    );
  };

  // Interactive Cost Calculator
  const costCalculation = useMemo(() => {
    const budget = Number(formValues.budget) || 0;
    const commission = Number(formValues.commissionRate) || 0;
    const estimatedSales = 100;
    const avgBasket = budget > 0 ? budget / 10 : 50;
    const estimatedPayoutsPer100 = Math.round(estimatedSales * avgBasket * (commission / 100));
    const protocolFee = Math.max(1, Math.round(budget * 0.005)); // 0.5% protocol fee
    const totalRequiredEscrow = budget + protocolFee;

    return {
      budget,
      commission,
      estimatedPayoutsPer100,
      protocolFee,
      totalRequiredEscrow,
    };
  }, [formValues.budget, formValues.commissionRate]);

  // Submit & Blockchain Push
  const onSubmit = async (data: CampaignWizardFormData) => {
    setIsDeploying(true);
    showNotification({
      type: "pending",
      title: "Deploying Campaign Escrow...",
      message: `Minting on-chain campaign with ${data.budget} ${data.asset} escrow pool.`,
      duration: 0,
    });

    try {
      // Simulate on-chain Soroban deployment and escrow lock
      await new Promise((resolve) => setTimeout(resolve, 1400));

      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setCreatedCampaignSuccess(true);

      showNotification({
        type: "success",
        title: "Campaign Created Successfully!",
        message: `${data.name} is now live and published to the Soroban smart contract.`,
      });
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "Deployment Failed",
        message: err instanceof Error ? err.message : "Failed to push campaign to blockchain.",
      });
    } finally {
      setIsDeploying(false);
    }
  };

  if (createdCampaignSuccess) {
    return (
      <Card className="border border-emerald-300 dark:border-emerald-800/80 bg-white dark:bg-zinc-900/60 rounded-3xl p-8 md:p-12 text-center max-w-2xl mx-auto shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white">
          Campaign Launched!
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">
          Your campaign{" "}
          <span className="font-bold text-zinc-800 dark:text-zinc-200">{formValues.name}</span> has
          been deployed with an escrow lock of{" "}
          <span className="font-bold text-indigo-600 dark:text-indigo-400">
            {formValues.budget} {formValues.asset}
          </span>
          . Affiliates can now discover and promote it on the marketplace.
        </p>
        <div className="flex justify-center gap-3 mt-6">
          <Button
            onClick={() => {
              setCreatedCampaignSuccess(false);
              setCurrentStep(1);
              reset(DEFAULT_WIZARD_VALUES);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-6 h-11 font-bold"
          >
            Create Another Campaign
          </Button>
        </div>
      </Card>
    );
  }

  const steps = [
    { number: 1, title: "Basic Info", icon: FileText },
    { number: 2, title: "Financials", icon: Coins },
    { number: 3, title: "Targeting & Tags", icon: Target },
    { number: 4, title: "Review & Deploy", icon: ShieldCheck },
  ];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Wizard Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              Create Campaign Wizard
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              Multi-Step Form
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 font-medium">
            Define campaign parameters, verify escrow calculations, and push directly to the Stellar
            blockchain.
          </p>
        </div>

        {/* Draft Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {hasLoadedDraft && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearDraft}
              className="text-xs text-zinc-500 hover:text-rose-600 font-semibold"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Clear Draft
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            className="rounded-xl border-slate-200 dark:border-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-200"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save as Draft
          </Button>
        </div>
      </div>

      {/* Progress Step Stepper */}
      <div className="bg-white dark:bg-zinc-900/50 p-4 md:p-6 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div className="grid grid-cols-4 gap-2">
          {steps.map((s) => {
            const Icon = s.icon;
            const isCompleted = currentStep > s.number;
            const isActive = currentStep === s.number;

            return (
              <div
                key={s.number}
                onClick={() => {
                  if (currentStep > s.number) setCurrentStep(s.number);
                }}
                className={`flex flex-col items-center sm:flex-row sm:items-center gap-2 p-2 sm:p-3 rounded-2xl transition-all ${
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80"
                    : isCompleted
                      ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                      : "opacity-50"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : isCompleted
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-200 dark:bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-[10px] uppercase font-bold text-zinc-400">Step {s.number}</p>
                  <p
                    className={`text-xs font-bold ${
                      isActive
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {s.title}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Steps Card with Framer Motion slide transitions */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-3xl shadow-sm overflow-hidden p-6 md:p-8">
          <AnimatePresence mode="wait">
            {/* STEP 1: BASIC INFO */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 25 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -25 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-6"
              >
                <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Step 1: Basic Campaign Information
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Provide the public branding and destination details for this campaign.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Campaign Title *
                    </label>
                    <Input
                      {...register("name")}
                      placeholder="e.g. Q4 Web3 Growth Accelerator"
                      className="h-11 rounded-2xl bg-slate-50 dark:bg-zinc-950/60"
                    />
                    {errors.name && (
                      <p className="text-xs text-rose-500 font-semibold">{errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Brand / Advertiser Name *
                    </label>
                    <Input
                      {...register("brandName")}
                      placeholder="e.g. Nexus Protocol Labs"
                      className="h-11 rounded-2xl bg-slate-50 dark:bg-zinc-950/60"
                    />
                    {errors.brandName && (
                      <p className="text-xs text-rose-500 font-semibold">
                        {errors.brandName.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Target Landing Page URL *
                  </label>
                  <Input
                    {...register("targetUrl")}
                    type="url"
                    placeholder="https://yourbrand.com/special-offer"
                    className="h-11 rounded-2xl bg-slate-50 dark:bg-zinc-950/60"
                  />
                  {errors.targetUrl && (
                    <p className="text-xs text-rose-500 font-semibold">
                      {errors.targetUrl.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Campaign Description *
                  </label>
                  <textarea
                    {...register("description")}
                    rows={3}
                    placeholder="Explain the product value, affiliate instructions, and conversion events..."
                    className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {errors.description && (
                    <p className="text-xs text-rose-500 font-semibold">
                      {errors.description.message}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* STEP 2: FINANCIALS & COST CALCULATOR */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 25 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -25 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-6"
              >
                <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Coins className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Step 2: Financials & Escrow Parameters
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Set your deposit token, commission payout percentage, and escrow security
                    deposit.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Escrow Asset */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Escrow Token Asset *
                    </label>
                    <select
                      {...register("asset")}
                      className="w-full h-11 px-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 text-sm font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {Object.keys(SUPPORTED_ESCROW_ASSETS).map((code) => (
                        <option key={code} value={code}>
                          {code} - {SUPPORTED_ESCROW_ASSETS[code as SupportedEscrowAssetCode].name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Escrow Budget */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Total Escrow Budget ({formValues.asset}) *
                    </label>
                    <Input
                      type="number"
                      {...register("budget", { valueAsNumber: true })}
                      placeholder="1000"
                      className="h-11 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 font-bold"
                    />
                    {errors.budget && (
                      <p className="text-xs text-rose-500 font-semibold">{errors.budget.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Commission Rate */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Affiliate Commission Rate (%) *
                    </label>
                    <Input
                      type="number"
                      {...register("commissionRate", { valueAsNumber: true })}
                      placeholder="15"
                      className="h-11 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 font-bold"
                    />
                    {errors.commissionRate && (
                      <p className="text-xs text-rose-500 font-semibold">
                        {errors.commissionRate.message}
                      </p>
                    )}
                  </div>

                  {/* Clearing Period */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Clearing Lock Period (Days) *
                    </label>
                    <Input
                      type="number"
                      {...register("clearingPeriod", { valueAsNumber: true })}
                      placeholder="7"
                      className="h-11 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 font-bold"
                    />
                    {errors.clearingPeriod && (
                      <p className="text-xs text-rose-500 font-semibold">
                        {errors.clearingPeriod.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Interactive Cost Calculator Card */}
                <div className="p-5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Interactive Escrow Cost Calculator
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200/60 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                      Real-Time Estimate
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-indigo-100 dark:border-indigo-900/50">
                      <p className="text-[10px] uppercase font-bold text-zinc-400">
                        Escrow Deposit
                      </p>
                      <p className="text-base font-extrabold text-zinc-900 dark:text-white mt-0.5">
                        {costCalculation.budget.toLocaleString()} {formValues.asset}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-indigo-100 dark:border-indigo-900/50">
                      <p className="text-[10px] uppercase font-bold text-zinc-400">
                        Est. Payouts (100 Sales)
                      </p>
                      <p className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
                        ~{costCalculation.estimatedPayoutsPer100.toLocaleString()}{" "}
                        {formValues.asset}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-indigo-100 dark:border-indigo-900/50">
                      <p className="text-[10px] uppercase font-bold text-zinc-400">
                        Total Required Escrow
                      </p>
                      <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {costCalculation.totalRequiredEscrow.toLocaleString()} {formValues.asset}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 3: TARGETING & TAGS */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 25 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -25 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-6"
              >
                <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Step 3: Targeting, Tags & Qualification
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Tag your campaign for discoverability and set minimum affiliate qualification
                    scores.
                  </p>
                </div>

                {/* Category Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Primary Category *
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setValue("category", cat, { shouldValidate: true })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          formValues.category === cat
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                            : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-200"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tags input */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Tags & Keywords (Press Add or Enter) *
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="e.g. DeFi, Yield, Crypto, SaaS..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      className="h-11 rounded-2xl bg-slate-50 dark:bg-zinc-950/60"
                    />
                    <Button
                      type="button"
                      onClick={handleAddTag}
                      className="h-11 px-5 rounded-2xl bg-zinc-900 dark:bg-zinc-800 text-white font-bold"
                    >
                      Add Tag
                    </Button>
                  </div>

                  {/* Rendered tag pills */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {(formValues.tags || []).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                      >
                        <Tag className="w-3 h-3 text-indigo-500" />
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-rose-500 font-bold ml-1 cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  {errors.tags && (
                    <p className="text-xs text-rose-500 font-semibold">{errors.tags.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Target Audience */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Target Audience / Distribution Channels *
                    </label>
                    <Input
                      {...register("targetAudience")}
                      placeholder="e.g. Telegram Communities, Twitter/X Creators"
                      className="h-11 rounded-2xl bg-slate-50 dark:bg-zinc-950/60"
                    />
                    {errors.targetAudience && (
                      <p className="text-xs text-rose-500 font-semibold">
                        {errors.targetAudience.message}
                      </p>
                    )}
                  </div>

                  {/* Min Affiliate Reputation */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Min Affiliate Reputation Score (0–100)
                    </label>
                    <Input
                      type="number"
                      {...register("minAffiliateReputation", { valueAsNumber: true })}
                      placeholder="25"
                      className="h-11 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 font-bold"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 4: REVIEW & BLOCKCHAIN CONFIRMATION */}
            {currentStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 25 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -25 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-6"
              >
                <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Step 4: Review & Blockchain Confirmation
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Review your complete configuration and deploy your escrow vault to Soroban.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Summary Card 1 */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 space-y-2">
                    <p className="text-[10px] uppercase font-bold text-zinc-400">
                      Campaign Overview
                    </p>
                    <div>
                      <span className="text-zinc-400 font-medium">Title:</span>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">
                        {formValues.name}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-400 font-medium">Brand:</span>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {formValues.brandName}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-400 font-medium">Destination URL:</span>
                      <p className="font-mono text-zinc-700 dark:text-zinc-300 truncate">
                        {formValues.targetUrl}
                      </p>
                    </div>
                  </div>

                  {/* Summary Card 2 */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 space-y-2">
                    <p className="text-[10px] uppercase font-bold text-zinc-400">Financial Setup</p>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Asset:</span>
                      <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
                        {formValues.asset}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Budget Deposit:</span>
                      <span className="font-extrabold text-zinc-900 dark:text-white">
                        {formValues.budget} {formValues.asset}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Commission Rate:</span>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                        {formValues.commissionRate}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Clearing Lock:</span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">
                        {formValues.clearingPeriod} Days
                      </span>
                    </div>
                  </div>
                </div>

                {/* Blockchain Transaction Notice */}
                <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-start gap-3">
                  <Zap className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <h5 className="font-bold text-indigo-900 dark:text-indigo-200">
                      Smart Contract Escrow Lock
                    </h5>
                    <p className="text-indigo-800/80 dark:text-indigo-300/80 mt-1">
                      Submitting will deploy the campaign parameters onto Soroban smart contracts.
                      Your wallet (
                      {userAddress ? formatStellarAddress(userAddress) : "Not connected"}) will be
                      prompted to sign the escrow transaction.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stepper Buttons Footer */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-zinc-800/60 mt-8">
            {currentStep > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevStep}
                className="rounded-xl h-11 px-5 font-bold"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Previous Step
              </Button>
            ) : (
              <div />
            )}

            {currentStep < 4 ? (
              <Button
                type="button"
                onClick={handleNextStep}
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-11 px-6 font-bold shadow-md shadow-indigo-500/20"
              >
                Next Step
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isDeploying}
                className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl h-11 px-7 font-extrabold shadow-lg shadow-emerald-500/20"
              >
                {isDeploying ? (
                  <>
                    <Zap className="w-4 h-4 mr-2 animate-pulse" />
                    Pushing to Blockchain...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Deploy & Push Campaign
                  </>
                )}
              </Button>
            )}
          </div>
        </Card>
      </form>
    </div>
  );
};
