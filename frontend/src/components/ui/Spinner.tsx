interface SpinnerProps {
  label?: string;
  className?: string;
}

export function Spinner({ className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className ?? ''}`}
    />
  );
}

export function FullPageSpinner({ label }: SpinnerProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
      <div className="flex items-center gap-3">
        <Spinner className="h-5 w-5 text-brand-700" />
        <span className="text-sm">{label ?? 'Loading…'}</span>
      </div>
    </div>
  );
}
