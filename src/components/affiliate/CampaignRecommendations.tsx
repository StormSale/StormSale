import { ArrowRight, Flame, Sparkles } from "lucide-react";
import { getAffiliateNiches, getCampaignRecommendations } from "../../lib/campaignRecommendations";

interface CampaignRecommendationsProps {
  layout?: "carousel" | "grid";
  onBrowse?: () => void;
}

export const CampaignRecommendations = ({
  layout = "grid",
  onBrowse,
}: CampaignRecommendationsProps) => {
  const recommendations = getCampaignRecommendations(getAffiliateNiches());

  return (
    <section className="space-y-5" aria-labelledby="recommendations-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="recommendations-heading"
            className="text-xl font-extrabold text-zinc-900 dark:text-white"
          >
            Recommended For You
          </h2>
          <p className="mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Ranked by conversion rate, escrow solvency, and niche match.
          </p>
        </div>
        {onBrowse && (
          <button
            type="button"
            onClick={onBrowse}
            className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Browse marketplace <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        className={
          layout === "carousel"
            ? "flex snap-x gap-4 overflow-x-auto pb-3"
            : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        }
      >
        {recommendations.map((campaign) => (
          <article
            key={campaign.id}
            className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70 ${
              layout === "carousel" ? "min-w-[280px] max-w-[340px] snap-start flex-1" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-white">{campaign.name}</h3>
                <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {campaign.description}
                </p>
              </div>
              <span className="shrink-0 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                {campaign.score}% match
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {campaign.trending && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                  <Flame className="h-3 w-3" /> Trending
                </span>
              )}
              {campaign.commissionRate >= 20 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Sparkles className="h-3 w-3" /> Top Paying
                </span>
              )}
              {campaign.niches.map((niche) => (
                <span
                  key={niche}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {niche}
                </span>
              ))}
            </div>

            <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 dark:border-zinc-800">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">CVR</dt>
                <dd className="mt-1 text-sm font-extrabold text-zinc-900 dark:text-white">
                  {campaign.conversionRate}%
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                  Escrow funded
                </dt>
                <dd className="mt-1 text-sm font-extrabold text-zinc-900 dark:text-white">
                  {Math.round((campaign.escrowBalance / campaign.escrowTarget) * 100)}%
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                  Commission
                </dt>
                <dd className="mt-1 text-sm font-extrabold text-zinc-900 dark:text-white">
                  {campaign.commissionRate}%
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Featured demo campaigns and metrics are shown until live marketplace data is connected.
      </p>
    </section>
  );
};
