import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import {
  BACKUP_WITHHOLDING_RATE_PCT,
  TAX_FORM_THRESHOLD_USD,
  type TaxStatus,
} from "../../lib/taxCompliance";

export interface TaxStatusBannerProps {
  status: TaxStatus | null;
  required: boolean;
  onOpenForm: () => void;
}

export const TaxStatusBanner = ({ status, required, onOpenForm }: TaxStatusBannerProps) => {
  if (status) {
    return (
      <div
        role="status"
        data-testid="tax-status-banner-confirmed"
        className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 flex items-center gap-3"
      >
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <p className="text-xs">
          <strong>{status.formType}</strong> on file ({status.countryCode}). Withholding rate:{" "}
          <strong>{status.withholdingPct}%</strong>.
        </p>
      </div>
    );
  }

  if (!required) return null;

  return (
    <div
      role="alert"
      data-testid="tax-status-banner-required"
      className="p-4 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <p className="text-xs">
          Earnings exceed ${TAX_FORM_THRESHOLD_USD}. Submit a tax form to avoid{" "}
          {BACKUP_WITHHOLDING_RATE_PCT}% backup withholding.
        </p>
      </div>
      <Button size="sm" onClick={onOpenForm} data-testid="btn-open-tax-form">
        Complete tax form
      </Button>
    </div>
  );
};
