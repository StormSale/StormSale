import { useMemo, useState } from "react";
import { AlertTriangle, Save, Search } from "lucide-react";
import { useNotification } from "../../context/NotificationContext";
import {
  COUNTRY_CODES,
  getCampaignGeoRestriction,
  getCountryName,
  saveCampaignGeoRestriction,
  type CountryCode,
  type GeoRestrictionMode,
} from "../../lib/geoTargeting";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface CampaignGeoTargetingSettingsProps {
  campaignId: string;
  campaignName: string;
}

export const CampaignGeoTargetingSettings = ({
  campaignId,
  campaignName,
}: CampaignGeoTargetingSettingsProps) => {
  const [restriction, setRestriction] = useState(() => getCampaignGeoRestriction(campaignId));
  const [campaignAddress, setCampaignAddress] = useState(restriction.campaignAddress);
  const [countrySearch, setCountrySearch] = useState("");
  const { showNotification } = useNotification();

  const countries = useMemo(
    () =>
      COUNTRY_CODES.map((code) => ({ code, name: getCountryName(code) })).sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [],
  );
  const filteredCountries = countries.filter(({ name, code }) =>
    `${name} ${code}`.toLowerCase().includes(countrySearch.toLowerCase()),
  );

  const updateSelection = (countryCode: CountryCode, checked: boolean) => {
    const selectedCountries = checked
      ? [...restriction.countries, countryCode]
      : restriction.countries.filter((country) => country !== countryCode);

    setRestriction({
      ...restriction,
      countries: selectedCountries,
      jurisdictionalTags: [
        restriction.mode,
        ...selectedCountries.map((country) => `country:${country}`),
      ],
    });
  };

  const saveSettings = () => {
    try {
      setRestriction(
        saveCampaignGeoRestriction(
          campaignId,
          campaignAddress,
          restriction.mode,
          restriction.countries,
        ),
      );
      showNotification({
        type: "success",
        title: "Geo-targeting saved",
        message: `Jurisdiction restrictions for ${campaignName} are stored in campaign metadata.`,
      });
    } catch (error) {
      console.error("Failed to save campaign geo-targeting:", error);
      showNotification({
        type: "error",
        title: "Could not save geo-targeting",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const changeMode = (mode: GeoRestrictionMode) => {
    setRestriction({
      ...restriction,
      mode,
      jurisdictionalTags: [mode, ...restriction.countries.map((country) => `country:${country}`)],
    });
  };

  return (
    <div className="mt-5 space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 dark:border-indigo-500/20 dark:bg-indigo-500/5">
      <div>
        <h4 className="font-bold text-zinc-900 dark:text-white">Geo-targeting</h4>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Choose countries where affiliate conversions are allowed or blocked.
        </p>
      </div>

      <label className="block space-y-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300">
        Campaign contract address
        <Input
          value={campaignAddress}
          onChange={(event) => setCampaignAddress(event.target.value)}
          placeholder="Enter the full contract address used when logging a sale"
          aria-label={`Campaign contract address for ${campaignName}`}
          className="h-10 rounded-xl bg-white font-mono text-xs dark:bg-zinc-950"
        />
      </label>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Geographic restriction mode">
        {(
          [
            ["allowlist", "Allow only selected countries"],
            ["blocklist", "Block selected countries"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={restriction.mode === mode}
            onClick={() => changeMode(mode)}
            className={`rounded-xl border px-3 py-2 text-xs font-bold ${
              restriction.mode === mode
                ? "border-indigo-500 bg-indigo-600 text-white"
                : "border-slate-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          value={countrySearch}
          onChange={(event) => setCountrySearch(event.target.value)}
          placeholder="Search countries..."
          aria-label="Search countries"
          className="h-10 rounded-xl bg-white pl-9 dark:bg-zinc-950"
        />
      </div>

      <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3 dark:border-zinc-700 dark:bg-zinc-950">
        {filteredCountries.map(({ code, name }) => (
          <label
            key={code}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-700 hover:bg-slate-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <input
              type="checkbox"
              checked={restriction.countries.includes(code)}
              onChange={(event) => updateSelection(code, event.target.checked)}
              className="accent-indigo-600"
            />
            <span>{name}</span>
            <span className="ml-auto font-mono text-[10px] text-zinc-400">{code}</span>
          </label>
        ))}
        {filteredCountries.length === 0 && (
          <p className="col-span-full py-3 text-center text-xs text-zinc-500">
            No countries match that search.
          </p>
        )}
      </div>

      {restriction.mode === "allowlist" && restriction.countries.length === 0 && (
        <p className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Select at least one country before saving. An empty allowlist blocks all conversions.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {restriction.countries.length} selected · tags:{" "}
          {restriction.jurisdictionalTags.join(", ") || "none"}
        </p>
        <Button
          type="button"
          onClick={saveSettings}
          className="h-9 shrink-0 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-500"
        >
          <Save className="mr-2 h-3.5 w-3.5" />
          Save settings
        </Button>
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        Settings are stored in this browser&apos;s campaign metadata. A shared backend is required
        to synchronize these rules across advertiser and affiliate devices.
      </p>
    </div>
  );
};
