import { useState } from "react";
import { X, FileText } from "lucide-react";
import { Button } from "../ui/button";
import {
  TAX_COUNTRIES,
  TAX_FORM_THRESHOLD_USD,
  formTypeForCountry,
  getCountryRatePct,
  validateTaxForm,
  type TaxFormErrors,
  type TaxFormInput,
} from "../../lib/taxCompliance";

export interface TaxFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: TaxFormInput) => void;
}

export const TaxFormModal = ({ isOpen, onClose, onSubmit }: TaxFormModalProps) => {
  const [countryCode, setCountryCode] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [errors, setErrors] = useState<TaxFormErrors>({});

  if (!isOpen) return null;

  const formType = countryCode ? formTypeForCountry(countryCode) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: TaxFormInput = { countryCode, signatureName, signatureAccepted };
    const found = validateTaxForm(input);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(input);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="tax-form-title"
        data-testid="tax-form-modal"
        onSubmit={handleSubmit}
        className="max-w-md w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 id="tax-form-title" className="text-base font-bold">
                Tax Declaration Required
              </h3>
              <p className="text-xs text-zinc-500">
                Your earnings exceed ${TAX_FORM_THRESHOLD_USD} this year.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tax form"
            data-testid="tax-form-close"
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor="tax-country" className="text-xs font-semibold">
            Country of tax residence
          </label>
          <select
            id="tax-country"
            data-testid="tax-country-select"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          >
            <option value="">Select a country…</option>
            {TAX_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.countryCode && (
            <p role="alert" className="text-xs text-rose-600" data-testid="tax-error-country">
              {errors.countryCode}
            </p>
          )}
        </div>

        {formType && (
          <p className="text-xs text-zinc-600 dark:text-zinc-300" data-testid="tax-form-type">
            Form: <strong>{formType}</strong> · Withholding:{" "}
            <strong>{getCountryRatePct(countryCode)}%</strong>
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="tax-signature" className="text-xs font-semibold">
            Full legal name (digital signature)
          </label>
          <input
            id="tax-signature"
            data-testid="tax-signature-name"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          />
          {errors.signatureName && (
            <p role="alert" className="text-xs text-rose-600" data-testid="tax-error-name">
              {errors.signatureName}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              data-testid="tax-signature-checkbox"
              checked={signatureAccepted}
              onChange={(e) => setSignatureAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Under penalties of perjury, I certify the information provided is true, correct and
              complete.
            </span>
          </label>
          {errors.signatureAccepted && (
            <p role="alert" className="text-xs text-rose-600" data-testid="tax-error-signature">
              {errors.signatureAccepted}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Later
          </Button>
          <Button type="submit" data-testid="tax-form-submit">
            Submit declaration
          </Button>
        </div>
      </form>
    </div>
  );
};
