import { formatCurrency } from '@/lib/format';

interface SummaryCardProps {
  label: string;
  value: number;
  tone?: 'default' | 'positive' | 'negative' | 'brand' | 'warn';
  hint?: string;
}

const TONE_CLASSES: Record<NonNullable<SummaryCardProps['tone']>, string> = {
  default: 'bg-white text-slate-900',
  positive: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  negative: 'bg-red-50 text-red-900 border-red-200',
  brand: 'bg-brand-50 text-brand-900 border-brand-200',
  warn: 'bg-amber-50 text-amber-900 border-amber-200',
};

export function SummaryCard({ label, value, tone = 'default', hint }: SummaryCardProps) {
  return (
    <div className={`rounded-lg border border-slate-200 p-4 ${TONE_CLASSES[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-xl font-bold">{formatCurrency(value)}</div>
      {hint && <div className="mt-0.5 text-[11px] opacity-70">{hint}</div>}
    </div>
  );
}
