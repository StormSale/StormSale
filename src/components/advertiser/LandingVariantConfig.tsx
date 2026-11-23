/**
 * src/components/advertiser/LandingVariantConfig.tsx
 *
 * Landing Page URL Variant split configuration with weight sliders (Issue #155).
 */
import React from "react";
import { Plus, Trash2, Sliders } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { type LandingPageVariant, normalizeVariantWeights } from "../../utils/abTesting";

export interface LandingVariantConfigProps {
  variants: LandingPageVariant[];
  onChange: (variants: LandingPageVariant[]) => void;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
}

export const LandingVariantConfig: React.FC<LandingVariantConfigProps> = ({
  variants,
  onChange,
  enabled,
  onToggleEnabled,
}) => {
  const totalWeight = variants.reduce((sum, v) => sum + (Number(v.weight) || 0), 0);
  const isValidSplit = totalWeight === 100;

  const handleAddVariant = () => {
    const nextLetter = String.fromCharCode(65 + variants.length); // A, B, C...
    const newVariant: LandingPageVariant = {
      id: `var_${Date.now()}_${variants.length}`,
      name: `Variant ${nextLetter}`,
      url: "https://",
      weight: 0,
    };
    const updated = normalizeVariantWeights([...variants, newVariant]);
    onChange(updated);
  };

  const handleRemoveVariant = (index: number) => {
    if (variants.length <= 1) return;
    const updated = variants.filter((_, i) => i !== index);
    onChange(normalizeVariantWeights(updated));
  };

  const handleUpdate = (index: number, field: keyof LandingPageVariant, value: any) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleNormalize = () => {
    onChange(normalizeVariantWeights(variants));
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-500" />
          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            A/B Testing Attribution Optimizer
          </h4>
        </div>
        <button
          type="button"
          onClick={() => onToggleEnabled(!enabled)}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
            enabled
              ? "bg-indigo-600 border-indigo-600 text-white"
              : "bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
          }`}
        >
          {enabled ? "Enabled" : "Disabled"}
        </button>
      </div>

      {enabled && (
        <div className="space-y-4 pt-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Distribute inbound referral traffic deterministically across landing page variants to
            test conversion rates and basket values.
          </p>

          {/* Allocation Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-zinc-500 dark:text-zinc-400">Traffic Allocation:</span>
              <span
                className={isValidSplit ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}
              >
                {totalWeight}% / 100%
              </span>
            </div>
            <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden flex">
              {variants.map((v, i) => {
                const colors = [
                  "bg-indigo-500",
                  "bg-emerald-500",
                  "bg-sky-500",
                  "bg-amber-500",
                  "bg-purple-500",
                ];
                return (
                  <div
                    key={v.id}
                    style={{ width: `${Math.min(100, Math.max(0, v.weight))}%` }}
                    className={`h-full ${colors[i % colors.length]}`}
                    title={`${v.name}: ${v.weight}%`}
                  />
                );
              })}
            </div>
          </div>

          {/* Variant Rows */}
          <div className="space-y-3">
            {variants.map((variant, index) => (
              <div
                key={variant.id}
                className="p-3 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg space-y-3 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <Input
                    value={variant.name}
                    onChange={(e) => handleUpdate(index, "name", e.target.value)}
                    placeholder="Variant name"
                    className="w-1/3 text-xs h-8"
                  />
                  <Input
                    value={variant.url}
                    onChange={(e) => handleUpdate(index, "url", e.target.value)}
                    placeholder="https://merchant.com/landing-variant"
                    className="flex-1 text-xs h-8"
                  />
                  {variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVariant(index)}
                      className="p-1.5 text-zinc-400 hover:text-rose-500 transition-colors"
                      title="Remove variant"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 w-24">
                    Split Weight: {variant.weight}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={variant.weight}
                    onChange={(e) => handleUpdate(index, "weight", Number(e.target.value))}
                    className="flex-1 accent-indigo-600 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddVariant}
              className="text-xs h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add URL Variant
            </Button>

            {!isValidSplit && (
              <button
                type="button"
                onClick={handleNormalize}
                className="text-xs font-bold text-indigo-500 hover:text-indigo-400"
              >
                Auto-normalize to 100%
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
