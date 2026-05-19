import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getClient } from '@/api/clients';
import {
  downloadReportPdf,
  exportReportToCanva,
  finalizeReport,
  getCanvaStatus,
  getReport,
} from '@/api/reports';
import { extractErrorMessage } from '@/api/client';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SummaryCard } from '@/features/reports/components/SummaryCard';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { BalanceInput } from '@/types';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ReportDetailPage() {
  const { reportId } = useParams();
  const id = Number(reportId);
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState<'sacs' | 'tcc' | null>(null);
  const [exporting, setExporting] = useState<'sacs' | 'tcc' | null>(null);

  const reportQuery = useQuery({
    queryKey: ['report', id],
    queryFn: () => getReport(id),
    enabled: !Number.isNaN(id),
  });
  const clientQuery = useQuery({
    queryKey: ['client', reportQuery.data?.client_id],
    queryFn: () => getClient(reportQuery.data!.client_id),
    enabled: !!reportQuery.data?.client_id,
  });
  const canvaQuery = useQuery({
    queryKey: ['integrations', 'canva'],
    queryFn: getCanvaStatus,
    staleTime: 5 * 60 * 1000,
  });

  const finalizeMut = useMutation({
    mutationFn: (balances: BalanceInput[]) => finalizeReport(id, { balances }),
    onSuccess: () => {
      toast.success('Report finalized');
      queryClient.invalidateQueries({ queryKey: ['report', id] });
      queryClient.invalidateQueries({ queryKey: ['client', reportQuery.data?.client_id, 'reports'] });
    },
    onError: (err) => toast.error(extractErrorMessage(err, 'Failed to finalize')),
  });

  if (reportQuery.isLoading) {
    return (
      <div className="card flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Loading report…
      </div>
    );
  }
  if (reportQuery.isError || !reportQuery.data) {
    return <div className="card text-sm text-red-600">Report not found.</div>;
  }

  const report = reportQuery.data;
  const totals = report.totals;
  const client = clientQuery.data;

  const handleDownload = async (type: 'sacs' | 'tcc') => {
    if (report.status !== 'final') {
      toast.error('Finalize the report before downloading PDFs');
      return;
    }
    setDownloading(type);
    try {
      const blob = await downloadReportPdf(report.id, type);
      const surname = client?.primary_last_name?.toLowerCase() ?? 'report';
      const period = report.period_label.replace(/\s+/g, '_').toLowerCase();
      downloadBlob(blob, `${surname}_${period}_${type}.pdf`);
    } catch (err) {
      toast.error(extractErrorMessage(err, `Failed to download ${type.toUpperCase()} PDF`));
    } finally {
      setDownloading(null);
    }
  };

  const handleCanvaExport = async (type: 'sacs' | 'tcc') => {
    if (report.status !== 'final') {
      toast.error('Finalize the report before exporting to Canva');
      return;
    }
    setExporting(type);
    try {
      const result = await exportReportToCanva(report.id, type);
      toast.success(`Sent ${type.toUpperCase()} to Canva`);
      window.open(result.edit_url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(extractErrorMessage(err, `Failed to export ${type.toUpperCase()} to Canva`));
    } finally {
      setExporting(null);
    }
  };

  const canvaEnabled = canvaQuery.data?.enabled ?? false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {client ? `${client.primary_first_name} ${client.primary_last_name}` : 'Report'} — {report.period_label}
          </h1>
          <p className="text-sm text-slate-500">
            Created {formatDateTime(report.created_at)}
            {report.finalized_at ? ` · Finalized ${formatDateTime(report.finalized_at)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={report.status} />
          {client && (
            <Link to={`/clients/${client.id}`} className="btn-secondary">
              Back to client
            </Link>
          )}
        </div>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Export</h2>
          <p className="text-xs text-slate-500">
            {report.status === 'final'
              ? 'Both PDFs are pre-rendered and ready.'
              : 'Finalize the report below to lock the snapshot and render PDFs.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {report.status !== 'final' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => finalizeMut.mutate(report.balances)}
              disabled={finalizeMut.isPending}
            >
              {finalizeMut.isPending ? 'Finalizing…' : 'Finalize report'}
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void handleDownload('sacs')}
            disabled={report.status !== 'final' || downloading !== null}
          >
            {downloading === 'sacs' ? 'Preparing…' : 'Download SACS PDF'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void handleDownload('tcc')}
            disabled={report.status !== 'final' || downloading !== null}
          >
            {downloading === 'tcc' ? 'Preparing…' : 'Download TCC PDF'}
          </button>
          {canvaEnabled && (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void handleCanvaExport('sacs')}
                disabled={report.status !== 'final' || exporting !== null}
                title="Open SACS PDF in your Canva workspace for last-minute edits"
              >
                {exporting === 'sacs' ? 'Sending…' : 'Edit SACS in Canva'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void handleCanvaExport('tcc')}
                disabled={report.status !== 'final' || exporting !== null}
                title="Open TCC PDF in your Canva workspace for last-minute edits"
              >
                {exporting === 'tcc' ? 'Sending…' : 'Edit TCC in Canva'}
              </button>
            </>
          )}
        </div>
      </div>
      {!canvaEnabled && (
        <p className="-mt-2 text-xs text-slate-400">
          Canva export is off. Set <code className="rounded bg-slate-100 px-1">CANVA_API_KEY</code> on the server to enable it.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">SACS — Cashflow</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <SummaryCard label="Monthly inflow" value={totals.sacs_inflow} tone="positive" />
            <SummaryCard label="Monthly outflow" value={totals.sacs_outflow} tone="negative" />
            <SummaryCard label="Monthly excess" value={totals.sacs_excess} tone="brand" />
            <SummaryCard
              label="PR target"
              value={totals.sacs_private_reserve_target}
              hint="6 × outflow + deductibles"
            />
          </div>
        </section>

        <section className="card space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">TCC — Net worth</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <SummaryCard label="Client 1 retirement" value={totals.tcc_client1_retirement_total} />
            <SummaryCard label="Client 2 retirement" value={totals.tcc_client2_retirement_total} />
            <SummaryCard
              label="Non-retirement"
              value={totals.tcc_non_retirement_total}
              hint="Trust excluded"
            />
            <SummaryCard label="Trust" value={totals.tcc_trust_total} />
            <SummaryCard label="Grand total" value={totals.tcc_grand_total} tone="brand" />
            <SummaryCard
              label="Liabilities (separate)"
              value={totals.tcc_liabilities_total}
              tone="warn"
            />
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="text-sm font-semibold text-slate-900">Balance snapshot</h2>
        {report.balances.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No balances recorded.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Field</th>
                <th className="py-2 pr-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {report.balances.map((b) => (
                <tr key={`${b.kind}:${b.field_key}`} className="border-t border-slate-100">
                  <td className="py-2 pr-3 capitalize">{b.kind.replace('_', ' ')}</td>
                  <td className="py-2 pr-3">{b.field_key}</td>
                  <td className="py-2 pr-3 text-right font-medium">{formatCurrency(b.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
