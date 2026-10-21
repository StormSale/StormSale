import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  Download,
  Share2,
  Sparkles,
  Send,
  TrendingUp,
  UserPlus,
  CheckCircle2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CopyButton } from "../ui/copy-button";
import { useReferralTree } from "../../hooks/useReferralTree";
import { useWeb3 } from "../../hooks/useWeb3";

export interface RecruiterInviteModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly portalled?: boolean;
}

export const RecruiterInviteModal: React.FC<RecruiterInviteModalProps> = ({
  isOpen,
  onClose,
  portalled = false,
}) => {
  const { userAddress } = useWeb3();
  const { recruiterLink, generateCustomInviteLink, bindRecruiter } = useReferralTree();

  const [tag, setTag] = useState("general");
  const [overrideRate, setOverrideRate] = useState(2.0);
  const [simulatedSalesXlm, setSimulatedSalesXlm] = useState(5000);
  const [inviteUrl, setInviteUrl] = useState(recruiterLink);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");

  // Manual recruit binding form state
  const [manualChildAddress, setManualChildAddress] = useState("");
  const [manualChildName, setManualChildName] = useState("");
  const [bindError, setBindError] = useState("");
  const [bindSuccess, setBindSuccess] = useState(false);

  useEffect(() => {
    const url = generateCustomInviteLink(tag.trim() || undefined, overrideRate);
    setInviteUrl(url);

    void QRCode.toDataURL(url, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 220,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then(setQrCodeDataUrl);
  }, [tag, overrideRate, generateCustomInviteLink]);

  const simulatedOverrideEarned = Number(((simulatedSalesXlm * overrideRate) / 100).toFixed(2));
  const simulatedDirectEarned = Number(
    ((simulatedSalesXlm * (10 - overrideRate)) / 100).toFixed(2),
  );

  const handleManualBind = (e: React.FormEvent) => {
    e.preventDefault();
    setBindError("");
    setBindSuccess(false);

    if (!manualChildAddress.trim()) {
      setBindError("Please enter a valid Stellar public key for the recruited marketer.");
      return;
    }

    if (!userAddress) {
      setBindError("Please connect your wallet first.");
      return;
    }

    const res = bindRecruiter(manualChildAddress.trim(), userAddress, {
      childName: manualChildName.trim() || undefined,
      overrideRatePercent: overrideRate,
      recruiterTag: tag.trim() || "manual-bind",
    });

    if (res.success) {
      setBindSuccess(true);
      setManualChildAddress("");
      setManualChildName("");
    } else {
      setBindError(res.error || "Failed to bind sub-affiliate.");
    }
  };

  const handleTelegramShare = () => {
    const text = encodeURIComponent(
      `Join my StormSale marketing network! Earn 8% direct commissions on decentralized Stellar escrow sales + I earn a 2% second-tier override.\n\nSign up with my recruiter link:`,
    );
    const url = encodeURIComponent(inviteUrl);
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        portalled={portalled}
        className="max-w-2xl p-0 overflow-hidden rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl"
      >
        {/* Modal Header */}
        <div className="p-6 pb-4 bg-gradient-to-r from-indigo-900 via-indigo-950 to-zinc-950 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex items-start justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Two-Tier Sub-Affiliate Recruitment</span>
              </div>
              <DialogTitle className="text-2xl font-black tracking-tight text-white mt-1">
                Invite Marketers & Earn Passive Overrides
              </DialogTitle>
              <DialogDescription className="text-zinc-300 text-xs leading-relaxed max-w-lg">
                Recruit affiliate marketers to your team. Whenever a recruited marketer drives a
                verified sale, you automatically receive a 2% second-tier override commission
                settled atomically on Stellar.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Recruiter Link Section */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700/60 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>Your Master Recruiter Link</span>
              </label>
              <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                2% Override Active
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={inviteUrl}
                className="font-mono text-xs bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 select-all"
                data-testid="input-recruiter-link"
              />
              <CopyButton text={inviteUrl} label="Copy Link" size="default" variant="indigo" />
            </div>

            {/* Link Customizer Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 block mb-1">
                  Campaign / Channel Tag
                </label>
                <Input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="e.g. telegram, twitter, direct"
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 block mb-1">
                  Override Commission Rate
                </label>
                <div className="flex items-center gap-2 h-8">
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="0.5"
                    value={overrideRate}
                    onChange={(e) => setOverrideRate(parseFloat(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400 w-12 text-right">
                    {overrideRate}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Social Share & QR Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            {/* QR Code Card */}
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center gap-4">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Recruiter QR Code"
                  className="w-24 h-24 rounded-xl border border-slate-200 dark:border-zinc-700 shadow-sm shrink-0"
                />
              ) : (
                <div className="w-24 h-24 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                  <span className="text-[10px] text-zinc-400">Loading QR...</span>
                </div>
              )}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">QR Code Invite</h4>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                  Share in presentations, in-person meetups, or conference booths.
                </p>
                {qrCodeDataUrl && (
                  <a
                    href={qrCodeDataUrl}
                    download="stormsale-recruiter-qr.png"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline pt-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download PNG</span>
                  </a>
                )}
              </div>
            </div>

            {/* Direct Telegram Share */}
            <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50 space-y-2">
              <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-bold text-xs">
                <Send className="w-4 h-4 text-sky-500" />
                <span>Instant Telegram Sharing</span>
              </div>
              <p className="text-[11px] text-sky-800 dark:text-sky-300/80 leading-snug">
                One-click broadcast to marketer channels and crypto affiliate communities.
              </p>
              <Button
                size="sm"
                onClick={handleTelegramShare}
                className="w-full h-8 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-sm flex items-center justify-center gap-1.5"
                data-testid="btn-telegram-share-invite"
              >
                <Send className="w-3 h-3" />
                <span>Share to Telegram</span>
              </Button>
            </div>
          </div>

          {/* Passive Earnings Simulator */}
          <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Passive Earnings Calculator</span>
              </span>
              <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                Sales Volume: <span className="text-indigo-600 dark:text-indigo-400 font-mono">{simulatedSalesXlm} XLM</span>
              </span>
            </div>

            <input
              type="range"
              min="1000"
              max="50000"
              step="1000"
              value={simulatedSalesXlm}
              onChange={(e) => setSimulatedSalesXlm(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-600 cursor-pointer"
            />

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-indigo-100 dark:border-zinc-800">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                  Selling Marketer Gets ({10 - overrideRate}%)
                </span>
                <span className="text-base font-black text-zinc-900 dark:text-white font-mono">
                  {simulatedDirectEarned} <span className="text-xs text-indigo-500 font-bold">XLM</span>
                </span>
              </div>

              <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700/60">
                <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 block">
                  Your 2nd-Tier Override ({overrideRate}%)
                </span>
                <span className="text-base font-black text-indigo-600 dark:text-indigo-400 font-mono">
                  +{simulatedOverrideEarned} <span className="text-xs font-bold">XLM</span>
                </span>
              </div>
            </div>
          </div>

          {/* Manual Marketer Registration */}
          <form
            onSubmit={handleManualBind}
            className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                <span>Directly Bind a Sub-Affiliate Wallet</span>
              </h4>
              <span className="text-[10px] text-zinc-400">On-Chain Binding</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                placeholder="Marketer Name / Alias (e.g. Alice Crypto)"
                value={manualChildName}
                onChange={(e) => setManualChildName(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Stellar Public Key (G...)"
                value={manualChildAddress}
                onChange={(e) => setManualChildAddress(e.target.value)}
                className="h-8 text-xs font-mono"
                data-testid="input-manual-recruit-address"
              />
            </div>

            {bindError && (
              <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                {bindError}
              </p>
            )}

            {bindSuccess && (
              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Marketer successfully bound! Added to your network tree.</span>
              </p>
            )}

            <Button
              type="submit"
              size="sm"
              className="w-full h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl"
              data-testid="btn-submit-manual-recruit"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              <span>Bind Marketer to Network</span>
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
