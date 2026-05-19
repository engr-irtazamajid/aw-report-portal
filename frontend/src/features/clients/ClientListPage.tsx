import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listClients } from '@/api/clients';
import { Spinner } from '@/components/ui/Spinner';
import { formatDateTime } from '@/lib/format';

export function ClientListPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['clients'],
    queryFn: listClients,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500">
            The single source of truth for client profiles and report history.
          </p>
        </div>
        <Link to="/clients/new" className="btn-primary">
          New client
        </Link>
      </div>

      {isLoading ? (
        <div className="card flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Loading clients…
        </div>
      ) : isError ? (
        <div className="card text-sm text-red-600">{(error as Error).message}</div>
      ) : !data || data.length === 0 ? (
        <div className="card text-center text-sm text-slate-500">
          No clients yet. Click <strong>New client</strong> to add the first one.
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Last report</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((client) => {
                const householdName =
                  client.spouse_first_name && client.spouse_last_name
                    ? `${client.primary_first_name} ${client.primary_last_name} & ${client.spouse_first_name} ${client.spouse_last_name}`
                    : `${client.primary_first_name} ${client.primary_last_name}`;
                return (
                  <tr key={client.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link to={`/clients/${client.id}`} className="hover:text-brand-700">
                        {householdName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {client.last_report_at ? formatDateTime(client.last_report_at) : (
                        <span className="text-slate-400">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/clients/${client.id}`} className="text-sm text-brand-700 hover:underline">
                        Open
                      </Link>
                      <span className="px-2 text-slate-300">·</span>
                      <Link
                        to={`/clients/${client.id}/reports/new`}
                        className="text-sm text-brand-700 hover:underline"
                      >
                        Generate report
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
