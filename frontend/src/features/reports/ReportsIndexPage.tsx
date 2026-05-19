import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { listClients } from '@/api/clients';
import { listReports } from '@/api/reports';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDateTime } from '@/lib/format';
import type { ClientSummary } from '@/types';

interface RowItem {
  client: ClientSummary;
  reportId: number;
  period: string;
  status: 'draft' | 'final';
  createdAt: string;
  finalizedAt: string | null;
}

export function ReportsIndexPage() {
  const clientsQuery = useQuery({ queryKey: ['clients'], queryFn: listClients });
  const reportsQueries = useQueries({
    queries: (clientsQuery.data ?? []).map((c) => ({
      queryKey: ['client', c.id, 'reports'],
      queryFn: () => listReports(c.id),
      enabled: Boolean(clientsQuery.data),
    })),
  });

  const isLoading = clientsQuery.isLoading || reportsQueries.some((q) => q.isLoading);

  const rows: RowItem[] = [];
  if (clientsQuery.data) {
    clientsQuery.data.forEach((client, idx) => {
      const reports = reportsQueries[idx]?.data ?? [];
      for (const r of reports) {
        rows.push({
          client,
          reportId: r.id,
          period: r.period_label,
          status: r.status,
          createdAt: r.created_at,
          finalizedAt: r.finalized_at,
        });
      }
    });
  }
  rows.sort((a, b) => (b.finalizedAt ?? b.createdAt).localeCompare(a.finalizedAt ?? a.createdAt));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">Every quarterly report across all clients.</p>
      </div>

      {isLoading ? (
        <div className="card flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Loading reports…
        </div>
      ) : rows.length === 0 ? (
        <div className="card text-center text-sm text-slate-500">
          No reports yet. Open a client and click <strong>Generate quarterly report</strong>.
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Finalized</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.reportId} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link to={`/clients/${row.client.id}`} className="hover:text-brand-700">
                      {row.client.primary_first_name} {row.client.primary_last_name}
                      {row.client.spouse_first_name && ` & ${row.client.spouse_first_name}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{row.period}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(row.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {row.finalizedAt ? formatDateTime(row.finalizedAt) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/reports/${row.reportId}`} className="text-brand-700 hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
