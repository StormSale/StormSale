import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlusCircle, X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export interface CampaignCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: { title: string; budget: string; rate: string }) => void;
}

export const CampaignCreationModal: React.FC<CampaignCreationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>({
    isOpen,
    onClose,
  });

  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState("");
  const [rate, setRate] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.({ title, budget, rate });
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
        <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
        <motion.div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="campaign-creation-title"
          aria-describedby="campaign-creation-desc"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 z-10"
        >
          <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-zinc-800">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="campaign-creation-title"
                  className="text-lg font-bold text-zinc-900 dark:text-zinc-100"
                >
                  Create Affiliate Campaign
                </h2>
                <p
                  id="campaign-creation-desc"
                  className="text-xs text-zinc-500 dark:text-zinc-400"
                >
                  Configure and deploy a new Soroban smart contract escrow campaign.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close campaign creation dialog"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="campaign-title">Campaign Title</Label>
              <Input
                id="campaign-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Summer Promo 2026"
                required
              />
            </div>

            <div>
              <Label htmlFor="campaign-budget">Initial Escrow Budget (XLM)</Label>
              <Input
                id="campaign-budget"
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="1000"
                required
              />
            </div>

            <div>
              <Label htmlFor="campaign-rate">Commission Rate (%)</Label>
              <Input
                id="campaign-rate"
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="10"
                required
              />
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Deploy Campaign</Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
