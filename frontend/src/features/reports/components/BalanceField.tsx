import { ChangeEvent } from 'react';
import { formatCurrency } from '@/lib/format';

interface BalanceFieldProps {
  id: string;
  label: string;
  sublabel?: string;
  value: number | '';
  lastValue?: number | null;
  required?: boolean;
  touched?: boolean;
  onChange: (value: number | '') => void;
  onUseLast?: () => void;
}

export function BalanceField({
  id,
  label,
  sublabel,
  value,
  lastValue,
  required,
  touched,
  onChange,
  onUseLast,
}: BalanceFieldProps) {
  const missing = required && touched && (value === '' || value == null);
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw === '') onChange('');
    else {
      const parsed = Number(raw);
      onChange(Number.isFinite(parsed) ? parsed : '');
    }
  };

  return (
    <div
      className={`rounded-md border p-3 transition ${
        missing
          ? 'border-amber-400 bg-amber-50'
          : value !== '' && value != null
            ? 'border-slate-200 bg-white'
            : 'border-slate-200 bg-white'
      }`}
    >
      <label htmlFor={id} className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-600">
        <span>{label}</span>
        {required && <span className="text-[10px] font-medium text-amber-700">Required</span>}
      </label>
      {sublabel && <p className="mt-0.5 text-[11px] text-slate-500">{sublabel}</p>}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-slate-400">$</span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="100"
          className="input"
          value={value}
          onChange={handleChange}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          Last quarter:{' '}
          {lastValue == null ? (
            <span className="text-slate-400">never recorded</span>
          ) : (
            <span className="font-medium text-slate-700">{formatCurrency(lastValue)}</span>
          )}
        </span>
        {lastValue != null && onUseLast && (
          <button
            type="button"
            className="text-brand-700 hover:underline"
            onClick={onUseLast}
          >
            Use last value
          </button>
        )}
      </div>
    </div>
  );
}
