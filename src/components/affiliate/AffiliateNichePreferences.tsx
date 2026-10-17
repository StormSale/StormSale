import { useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import {
  AFFILIATE_NICHES,
  getAffiliateNiches,
  saveAffiliateNiches,
  type AffiliateNiche,
} from "../../lib/campaignRecommendations";
import { useNotification } from "../../context/NotificationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const MAX_NICHES = 3;

export const AffiliateNichePreferences = () => {
  const [selectedNiches, setSelectedNiches] = useState<AffiliateNiche[]>(getAffiliateNiches);
  const { showNotification } = useNotification();

  const toggleNiche = (niche: AffiliateNiche) => {
    const nextNiches = selectedNiches.includes(niche)
      ? selectedNiches.filter((selected) => selected !== niche)
      : [...selectedNiches, niche];

    try {
      saveAffiliateNiches(nextNiches);
      setSelectedNiches(nextNiches);
      showNotification({
        type: "success",
        title: "Preferences saved",
        message: "Your campaign recommendations will reflect these niches.",
      });
    } catch (error) {
      console.error("Failed to save affiliate niche preferences:", error);
      showNotification({
        type: "error",
        title: "Could not save preferences",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Niche Preferences
        </h1>
        <p className="mt-2 font-medium text-zinc-500 dark:text-zinc-400">
          Choose up to three interests to personalize your campaign recommendations.
        </p>
      </div>

      <Card className="max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <CardHeader className="border-b border-slate-100 pb-5 dark:border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10">
              <SlidersHorizontal className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                Your marketing niches
              </CardTitle>
              <CardDescription className="mt-1 text-zinc-500 dark:text-zinc-400">
                {selectedNiches.length} of {MAX_NICHES} selected
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-4">
          {AFFILIATE_NICHES.map(({ id, label }) => {
            const isSelected = selectedNiches.includes(id);
            const isAtLimit = selectedNiches.length >= MAX_NICHES;

            return (
              <button
                key={id}
                type="button"
                aria-pressed={isSelected}
                disabled={!isSelected && isAtLimit}
                onClick={() => toggleNiche(id)}
                className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : "border-slate-200 bg-white text-zinc-700 hover:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                }`}
              >
                {label}
                {isSelected && <Check className="h-4 w-4" aria-hidden="true" />}
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};
