import { useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { InputField } from "../../components/ui/input-group";
import { InfoTooltip, TerminologyTooltip } from "../../components/ui/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { useAccountReserve } from "../../hooks/useAccountReserve";
import { useNotification } from "../../context/NotificationContext";
import {
  getCreateCampaignSchema,
  getFieldErrors,
  isPlainDecimalAmount,
} from "../../lib/validation";
import { CONTRACT_ADDRESSES } from "../../config/contracts";
import { formatStellarAddress } from "../../lib/stellar";
import {
  Zap,
  Target,
  Clock,
  DollarSign,
  Coins,
  ChevronDown,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Lock,
  Globe,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { setCampaignVisibility } from "../../lib/campaignAccess";
import { SUPPORTED_ESCROW_ASSETS } from "../../config/stellar";
import type { SupportedEscrowAssetCode } from "../../config/stellar";

const STROOPS_PER_XLM_DIGITS = 7;

const formatXlm = (value: number): string =>
  value.toFixed(STROOPS_PER_XLM_DIGITS).replace(/\.?0+$/, "") || "0";

/**
 * Converts a decimal XLM amount to integer stroops (1 XLM = 10^7 stroops)
 * without floating point drift. Extra fractional digits are truncated.
 */
export const toStroops = (value: string | number): bigint => {
  // `toFixed` switches to exponent notation at 1e21; whole numbers that large
  // are already integers, so scale them directly instead of returning 0.
  if (typeof value === "number" && Number.isFinite(value) && value >= 1e21) {
    return BigInt(value) * 10n ** BigInt(STROOPS_PER_XLM_DIGITS);
  }
  const raw =
    typeof value === "number"
      ? Number.isFinite(value)
        ? value.toFixed(STROOPS_PER_XLM_DIGITS)
        : "0"
      : value.trim();
  const match = /^(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match) return 0n;
  const whole = match[1] || "0";
  const frac = (match[2] ?? "")
    .slice(0, STROOPS_PER_XLM_DIGITS)
    .padEnd(STROOPS_PER_XLM_DIGITS, "0");
  return BigInt(whole) * 10n ** BigInt(STROOPS_PER_XLM_DIGITS) + BigInt(frac);
};

export type FlowStep =
  "idle" | "checking" | "approving" | "approved" | "creating" | "success" | "error";

export const CreateCampaignForm = () => {
  const [selectedAsset, setSelectedAsset] = useState<SupportedEscrowAssetCode>("XLM");
  const [commissionRate, setCommissionRate] = useState("");
  const [clearingPeriod, setClearingPeriod] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [budget, setBudget] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");
  const [isRefreshingAllowance, setIsRefreshingAllowance] = useState(false);
  // Private campaigns require affiliates to apply and be approved before they
  // can generate tracking links or be credited with sales.
  const [isPrivate, setIsPrivate] = useState(false);
  const [lastCreatedCampaign, setLastCreatedCampaign] = useState<{
    campaignId: number;
    txHash?: string;
  } | null>(null);

  const [assetAllowances, setAssetAllowances] = useState<Record<SupportedEscrowAssetCode, number>>({
    XLM: 0,
    USDC: 0,