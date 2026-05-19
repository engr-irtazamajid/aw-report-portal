type ReportStatus = 'draft' | 'final';

const LABELS: Record<ReportStatus, string> = {
  draft: 'Draft',
  final: 'Final',
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={status === 'final' ? 'badge-final' : 'badge-draft'}>
      {LABELS[status]}
    </span>
  );
}

export function CompletenessBadge({ remaining }: { remaining: number }) {
  return (
    <span className={remaining === 0 ? 'badge-final' : 'badge-draft'}>
      {remaining === 0 ? 'Complete' : `${remaining} left`}
    </span>
  );
}
