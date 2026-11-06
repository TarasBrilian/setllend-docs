import React, {type ReactNode} from 'react';

/** Reads a decimal typed with a dot or a comma. Empty or invalid input is NaN. */
export function parse(value: string): number {
  const cleaned = value.trim().replace(',', '.');
  if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

export function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '–';
  return value.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
}

export function Field({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
}) {
  return (
    <label className="calc__field">
      {suffix ? `${label} (${suffix})` : label}
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => {
          const next = event.target.value.replace(',', '.');
          if (/^\d*\.?\d*$/.test(next)) onChange(next);
        }}
      />
    </label>
  );
}

export function Result({label, value, tone}: {label: string; value: string; tone?: 'good' | 'bad'}) {
  return (
    <div className={`calc__result${tone ? ` calc__result--${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Calculator({title, children, note}: {title: string; children: ReactNode; note?: ReactNode}) {
  return (
    <div className="calc">
      <p className="calc__title">{title}</p>
      {children}
      {note ? <p className="calc__note">{note}</p> : null}
    </div>
  );
}
