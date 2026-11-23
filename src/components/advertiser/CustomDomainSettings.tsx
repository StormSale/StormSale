import React, { useState } from "react";
import { Button } from "../ui/button";
import {
  buildCnameRecord,
  checkCnamePropagation,
  isValidCustomDomain,
  type CnamePropagationResult,
} from "../../lib/branding";

interface CustomDomainSettingsProps {
  domain: string;
  onDomainChange: (domain: string) => void;
  checkPropagation?: (domain: string) => Promise<CnamePropagationResult>;
}

export const CustomDomainSettings: React.FC<CustomDomainSettingsProps> = ({
  domain,
  onDomainChange,
  checkPropagation = checkCnamePropagation,
}) => {
  const [result, setResult] = useState<CnamePropagationResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const isValid = isValidCustomDomain(domain);
  const record = buildCnameRecord(domain);

  const handleCheck = async () => {
    setIsChecking(true);
    try {
      setResult(await checkPropagation(domain));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="custom-domain-settings">
      <div>
        <label
          htmlFor="custom-domain"
          className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Custom Domain (Enterprise)
        </label>
        <input
          id="custom-domain"
          data-testid="custom-domain-input"
          type="text"
          value={domain}
          onChange={(event) => onDomainChange(event.target.value)}
          placeholder="portal.acme.com"
          className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
        />
      </div>

      <div className="p-3 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 font-mono text-[11px]">
        <div data-testid="cname-record">
          {record.type} {record.host || "your-domain.com"} → {record.value}
        </div>
        <div className="text-zinc-500 mt-1">Set TTL to 3600 seconds or the provider default.</div>
      </div>

      <Button
        type="button"
        variant="outline"
        data-testid="check-cname"
        onClick={handleCheck}
        disabled={!isValid || isChecking}
        className="text-xs"
      >
        {isChecking ? "Checking DNS..." : "Check CNAME Status"}
      </Button>

      {result && (
        <p role="status" data-testid="cname-status" className="text-xs">
          {result.message}
        </p>
      )}
    </div>
  );
};
