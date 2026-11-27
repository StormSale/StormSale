import * as React from "react";

export interface DateRangeValue { start: string; end: string }
export interface DatePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  min?: string;
}

export function DatePicker({ value, onChange, min = new Date().toISOString().slice(0, 10) }: DatePickerProps) {
  const start = value.start ? new Date(`${value.start}T00:00:00Z`) : null;
  const end = value.end ? new Date(`${value.end}T00:00:00Z`) : null;
  const duration = start && end && end >= start ? Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1 : null;
  return (
    <fieldset className="grid gap-3 rounded-xl border border-zinc-700 p-4">
      <legend className="px-2 text-sm font-medium">Campaign timeline</legend>
      <label className="grid gap-1 text-sm">Start date
        <input type="date" min={min} value={value.start} onChange={(event) => onChange({ ...value, start: event.target.value })} />
      </label>
      <label className="grid gap-1 text-sm">End date
        <input type="date" min={value.start || min} value={value.end} onChange={(event) => onChange({ ...value, end: event.target.value })} />
      </label>
      <p aria-live="polite" className="text-sm text-indigo-300">
        {duration ? `${duration} day${duration === 1 ? "" : "s"} selected` : "Choose a valid date range"}
      </p>
    </fieldset>
  );
}
