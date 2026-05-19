import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getClient } from '@/api/clients';
import { listReports } from '@/api/reports';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';

export function ClientDetailPage() {
  const { clientId } = useParams();
  const id = Number(clientId);

  const clientQuery = useQuery({ queryKey: ['client', id], queryFn: () => getClient(id) });
  const reportsQuery = useQuery({
    queryKey: ['client', id, 'reports'],
    queryFn: () => listReports(id),
    enabled: !Number.isNaN(id),
  });

  if (clientQuery.isLoading) {
    return (
      <div className="card flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Loading client…
      </div>
    );
  }

  if (clientQuery.isError || !clientQuery.data) {
    return <div className="card text-sm text-red-600">Client not found.</div>;
  }

  const c = clientQuery.data;
  const household =
    c.spouse_first_name && c.spouse_last_name
      ? `${c.primary_first_name} ${c.primary_last_name} & ${c.spouse_first_name} ${c.spouse_last_name}`
      : `${c.primary_first_name} ${c.primary_last_name}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{household}</h1>
          <p className="text-sm text-slate-500">Profile, accounts, liabilities, and report history.</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/clients/${id}/edit`} className="btn-secondary">
            Edit profile
          </Link>
          <Link to={`/clients/${id}/reports/new`} className="btn-primary">
            Generate quarterly report
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="text-sm font-semibold text-slate-900">Primary</h2>
          <DetailRow label="Name" value={`${c.primary_first_name} ${c.primary_last_name}`} />
          <DetailRow label="DOB" value={`${formatDate(c.primary_dob)} (Age ${c.primary_age})`} />
          <DetailRow label="SSN last 4" value={c.primary_ssn_last4_masked} />

          {c.spouse_first_name && (
            <>
              <h2 className="mt-4 text-sm font-semibold text-slate-900">Spouse</h2>
              <DetailRow label="Name" value={`${c.spouse_first_name} ${c.spouse_last_name}`} />
              {c.spouse_dob && (
                <DetailRow label="DOB" value={`${formatDate(c.spouse_dob)} (Age ${c.spouse_age})`} />
              )}
              {c.spouse_ssn_last4_masked && (
                <DetailRow label="SSN last 4" value={c.spouse_ssn_last4_masked} />
              )}
            </>
          )}
        </section>

        <section className="card">
          <h2 className="text-sm font-semibold text-slate-900">Static financials</h2>
          <DetailRow label="Monthly inflow" value={formatCurrency(c.monthly_inflow)} />
          <DetailRow label="Monthly outflow budget" value={formatCurrency(c.monthly_outflow_budget)} />
          <DetailRow
            label="Private Reserve target"
            value={
              c.private_reserve_target_override == null
                ? `Auto (6 × outflow + deductibles)`
                : `${formatCurrency(c.private_reserve_target_override)} (override)`
            }
          />
          <DetailRow label="Floor per account" value={formatCurrency(c.floor_amount)} />
        </section>

        <section className="card md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Accounts</h2>
          {c.accounts.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">None recorded.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Institution</th>
                  <th className="py-2 pr-3">Last 4</th>
                </tr>
              </thead>
              <tbody>
                {c.accounts.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 capitalize">{a.owner}</td>
                    <td className="py-2 pr-3 capitalize">{a.category.replace('_', ' ')}</td>
                    <td className="py-2 pr-3 capitalize">{a.account_type.replace('_', ' ')}</td>
                    <td className="py-2 pr-3">{a.institution || '—'}</td>
                    <td className="py-2 pr-3">{a.last_four ? `****${a.last_four}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="text-sm font-semibold text-slate-900">Liabilities</h2>
          {c.liabilities.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">None recorded.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {c.liabilities.map((l) => (
                <li key={l.id} className="flex justify-between border-b border-slate-100 py-1.5">
                  <span>
                    <span className="font-medium">{l.label}</span>
                    <span className="ml-2 text-slate-500">({l.liability_type.replace('_', ' ')})</span>
                  </span>
                  <span className="text-slate-500">
                    {l.interest_rate != null ? `${l.interest_rate.toFixed(2)}%` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="text-sm font-semibold text-slate-900">Trust & deductibles</h2>
          <div className="mt-2 space-y-1 text-sm">
            <div className="font-medium text-slate-700">Trust properties</div>
            {c.trust_properties.length === 0 ? (
              <p className="text-slate-500">None.</p>
            ) : (
              c.trust_properties.map((t) => (
                <div key={t.id} className="text-slate-600">
                  {t.label} — {t.address}
                </div>
              ))
            )}
            <div className="mt-3 font-medium text-slate-700">Insurance deductibles</div>
            {c.deductibles.length === 0 ? (
              <p className="text-slate-500">None.</p>
            ) : (
              c.deductibles.map((d) => (
                <div key={d.id} className="flex justify-between text-slate-600">
                  <span>{d.label}</span>
                  <span>{formatCurrency(d.amount)}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Report history</h2>
          <Link to={`/clients/${id}/reports/new`} className="btn-secondary">
            Generate quarterly report
          </Link>
        </div>
        {reportsQuery.isLoading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> Loading reports…
          </div>
        ) : !reportsQuery.data || reportsQuery.data.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No reports yet for this client.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Period</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3">Finalized</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {reportsQuery.data.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-medium">{r.period_label}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2 pr-3 text-slate-500">{formatDateTime(r.created_at)}</td>
                  <td className="py-2 pr-3 text-slate-500">
                    {r.finalized_at ? formatDateTime(r.finalized_at) : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Link to={`/reports/${r.id}`} className="text-sm text-brand-700 hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
