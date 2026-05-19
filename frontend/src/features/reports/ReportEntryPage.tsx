import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getClient, getLastBalances } from '@/api/clients';
import { createReport, finalizeReport } from '@/api/reports';
import { extractErrorMessage } from '@/api/client';
import { Spinner } from '@/components/ui/Spinner';
import { CompletenessBadge } from '@/components/ui/StatusBadge';
import { computeTotals } from '@/lib/calc';
import { formatCurrency } from '@/lib/format';
import type {
  AccountRead,
  BalanceInput,
  ClientDetail,
  ReportRead,
} from '@/types';
import { BalanceField } from '@/features/reports/components/BalanceField';
import { SummaryCard } from '@/features/reports/components/SummaryCard';

interface FieldDef {
  key: string;
  label: string;
  sublabel?: string;
  kind: BalanceInput['kind'];
  targetId?: number | null;
  required: boolean;
}

function defaultPeriodLabel(): string {
  const now = new Date();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return `Q${quarter} ${now.getFullYear()}`;
}

function buildFieldDefs(client: ClientDetail): FieldDef[] {
  const defs: FieldDef[] = [
    {
      key: 'private_reserve',
      label: 'Private Reserve balance',
      sublabel: 'High-yield savings (Pinnacle Bank)',
      kind: 'private_reserve',
      required: true,
    },
    {
      key: 'schwab_cash',
      label: 'Schwab investment cash',
      sublabel: 'Cash sitting in the Schwab brokerage',
      kind: 'schwab_cash',
      required: false,
    },
  ];

  for (const account of client.accounts) {
    defs.push(accountFieldDef(account));
  }
  for (const trust of client.trust_properties) {
    defs.push({
      key: `trust_${trust.id}`,
      label: `Trust value — ${trust.label}`,
      sublabel: `Zillow Zestimate for ${trust.address}`,
      kind: 'trust',
      targetId: trust.id,
      required: true,
    });
  }
  for (const liability of client.liabilities) {
    defs.push({
      key: `liability_${liability.id}`,
      label: `Liability balance — ${liability.label}`,
      sublabel: liability.interest_rate != null ? `Rate: ${liability.interest_rate.toFixed(2)}%` : undefined,
      kind: 'liability',
      targetId: liability.id,
      required: true,
    });
  }
  return defs;
}

function accountFieldDef(account: AccountRead): FieldDef {
  const ownerLabel =
    account.owner === 'primary' ? 'Primary' : account.owner === 'spouse' ? 'Spouse' : 'Joint';
  const typeLabel = account.label ?? account.account_type.replace('_', ' ').toUpperCase();
  return {
    key: `account_${account.id}`,
    label: `${ownerLabel} · ${typeLabel}`,
    sublabel:
      [account.institution, account.last_four ? `****${account.last_four}` : null]
        .filter(Boolean)
        .join(' · ') || undefined,
    kind: 'account',
    targetId: account.id,
    required: true,
  };
}

type FieldValues = Record<string, number | ''>;

export function ReportEntryPage() {
  const { clientId } = useParams();
  const id = Number(clientId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [periodLabel, setPeriodLabel] = useState<string>(defaultPeriodLabel());
  const [values, setValues] = useState<FieldValues>({});
  const [touched, setTouched] = useState(false);

  const clientQuery = useQuery({
    queryKey: ['client', id],
    queryFn: () => getClient(id),
    enabled: !Number.isNaN(id),
  });
  const lastQuery = useQuery({
    queryKey: ['client', id, 'last-balances'],
    queryFn: () => getLastBalances(id),
    enabled: !Number.isNaN(id),
  });

  const fieldDefs = useMemo(
    () => (clientQuery.data ? buildFieldDefs(clientQuery.data) : []),
    [clientQuery.data],
  );

  useEffect(() => {
    if (!fieldDefs.length) return;
    setValues((prev) => {
      const next: FieldValues = { ...prev };
      for (const def of fieldDefs) {
        if (next[def.key] === undefined) next[def.key] = '';
      }
      return next;
    });
  }, [fieldDefs]);

  const lastByKey = lastQuery.data?.by_field_key ?? {};

  const balances = useMemo<BalanceInput[]>(() => {
    return fieldDefs
      .filter((def) => values[def.key] !== '' && values[def.key] != null)
      .map((def) => ({
        kind: def.kind,
        target_id: def.targetId ?? null,
        field_key: def.key,
        amount: Number(values[def.key]),
      }));
  }, [fieldDefs, values]);

  const livePreview = useMemo(() => {
    if (!clientQuery.data) return null;
    return computeTotals({
      monthlyInflow: clientQuery.data.monthly_inflow,
      monthlyOutflow: clientQuery.data.monthly_outflow_budget,
      privateReserveOverride: clientQuery.data.private_reserve_target_override,
      deductibles: clientQuery.data.deductibles,
      accounts: clientQuery.data.accounts,
      balances,
    });
  }, [clientQuery.data, balances]);

  const missingRequired = useMemo(
    () => fieldDefs.filter((def) => def.required && (values[def.key] === '' || values[def.key] == null)),
    [fieldDefs, values],
  );

  const draftMut = useMutation({
    mutationFn: () =>
      createReport(id, {
        period_label: periodLabel.trim() || defaultPeriodLabel(),
        balances,
      }),
    onSuccess: (report: ReportRead) => {
      toast.success('Draft saved');
      queryClient.invalidateQueries({ queryKey: ['client', id, 'reports'] });
      navigate(`/reports/${report.id}`);
    },
    onError: (err) => toast.error(extractErrorMessage(err, 'Failed to save draft')),
  });

  const finalizeMut = useMutation({
    mutationFn: async () => {
      const report = await createReport(id, {
        period_label: periodLabel.trim() || defaultPeriodLabel(),
        balances,
      });
      return finalizeReport(report.id, { balances });
    },
    onSuccess: (report: ReportRead) => {
      toast.success('Report finalized');
      queryClient.invalidateQueries({ queryKey: ['client', id, 'reports'] });
      navigate(`/reports/${report.id}`);
    },
    onError: (err) => toast.error(extractErrorMessage(err, 'Failed to finalize report')),
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

  const client = clientQuery.data;
  const sacsFields = fieldDefs.filter(
    (def) => def.kind === 'private_reserve' || def.kind === 'schwab_cash',
  );
  const accountFields = fieldDefs.filter((def) => def.kind === 'account');
  const trustFields = fieldDefs.filter((def) => def.kind === 'trust');
  const liabilityFields = fieldDefs.filter((def) => def.kind === 'liability');

  const updateValue = (key: string, value: number | '') =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const applyLastForField = (key: string) => {
    const last = lastByKey[key];
    if (last != null) updateValue(key, last);
  };

  const applyLastForAll = () => {
    setValues((prev) => {
      const next: FieldValues = { ...prev };
      for (const def of fieldDefs) {
        if (lastByKey[def.key] != null) {
          next[def.key] = lastByKey[def.key];
        }
      }
      return next;
    });
    toast.success('Pre-filled fields with last-quarter values');
  };

  const onFinalize = () => {
    setTouched(true);
    if (missingRequired.length > 0) {
      toast.error(`${missingRequired.length} required field(s) still empty`);
      return;
    }
    finalizeMut.mutate();
  };

  const onSaveDraft = () => {
    draftMut.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Generate quarterly report</h1>
          <p className="text-sm text-slate-500">
            {client.primary_first_name} {client.primary_last_name}
            {client.spouse_first_name && ` & ${client.spouse_first_name} ${client.spouse_last_name}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/clients/${client.id}`} className="btn-secondary">
            Cancel
          </Link>
          <button
            type="button"
            className="btn-secondary"
            onClick={onSaveDraft}
            disabled={draftMut.isPending || finalizeMut.isPending}
          >
            {draftMut.isPending ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onFinalize}
            disabled={finalizeMut.isPending || draftMut.isPending}
          >
            {finalizeMut.isPending ? 'Finalizing…' : 'Finalize & generate PDFs'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="card">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex-1">
                <label className="label" htmlFor="period">Period label</label>
                <input
                  id="period"
                  className="input"
                  value={periodLabel}
                  onChange={(event) => setPeriodLabel(event.target.value)}
                  placeholder="Q2 2026"
                />
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={applyLastForAll}
                disabled={!lastQuery.data || Object.keys(lastByKey).length === 0}
              >
                Pre-fill from last quarter
              </button>
            </div>
            {lastQuery.data?.report_id && (
              <p className="mt-2 text-xs text-slate-500">
                Last finalized report: <strong>{lastQuery.data.period_label}</strong>
              </p>
            )}
          </div>

          <Section title="SACS — Cashflow inputs">
            <p className="text-xs text-slate-500">
              Monthly inflow {formatCurrency(client.monthly_inflow)} and outflow{' '}
              {formatCurrency(client.monthly_outflow_budget)} are pulled from the client profile.
            </p>
            <Grid>
              {sacsFields.map((def) => (
                <BalanceField
                  key={def.key}
                  id={`field-${def.key}`}
                  label={def.label}
                  sublabel={def.sublabel}
                  required={def.required}
                  touched={touched}
                  value={values[def.key] ?? ''}
                  lastValue={lastByKey[def.key]}
                  onChange={(v) => updateValue(def.key, v)}
                  onUseLast={() => applyLastForField(def.key)}
                />
              ))}
            </Grid>
          </Section>

          <Section
            title="TCC — Retirement & non-retirement balances"
            empty={accountFields.length === 0 ? 'No accounts on file for this client.' : undefined}
          >
            <Grid>
              {accountFields.map((def) => (
                <BalanceField
                  key={def.key}
                  id={`field-${def.key}`}
                  label={def.label}
                  sublabel={def.sublabel}
                  required={def.required}
                  touched={touched}
                  value={values[def.key] ?? ''}
                  lastValue={lastByKey[def.key]}
                  onChange={(v) => updateValue(def.key, v)}
                  onUseLast={() => applyLastForField(def.key)}
                />
              ))}
            </Grid>
          </Section>

          {trustFields.length > 0 && (
            <Section title="Trust">
              <Grid>
                {trustFields.map((def) => (
                  <BalanceField
                    key={def.key}
                    id={`field-${def.key}`}
                    label={def.label}
                    sublabel={def.sublabel}
                    required={def.required}
                    touched={touched}
                    value={values[def.key] ?? ''}
                    lastValue={lastByKey[def.key]}
                    onChange={(v) => updateValue(def.key, v)}
                    onUseLast={() => applyLastForField(def.key)}
                  />
                ))}
              </Grid>
            </Section>
          )}

          {liabilityFields.length > 0 && (
            <Section title="Liabilities (separate from net worth)">
              <Grid>
                {liabilityFields.map((def) => (
                  <BalanceField
                    key={def.key}
                    id={`field-${def.key}`}
                    label={def.label}
                    sublabel={def.sublabel}
                    required={def.required}
                    touched={touched}
                    value={values[def.key] ?? ''}
                    lastValue={lastByKey[def.key]}
                    onChange={(v) => updateValue(def.key, v)}
                    onUseLast={() => applyLastForField(def.key)}
                  />
                ))}
              </Grid>
            </Section>
          )}
        </div>

        <aside className="space-y-3">
          <div className="card sticky top-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Live preview</h2>
              <CompletenessBadge remaining={missingRequired.length} />
            </div>
            <p className="text-xs text-slate-500">
              Updates instantly as you type. Calculations match the server.
            </p>

            {livePreview && (
              <div className="grid gap-2">
                <SummaryCard label="SACS Inflow" value={livePreview.sacs_inflow} tone="positive" />
                <SummaryCard label="SACS Outflow" value={livePreview.sacs_outflow} tone="negative" />
                <SummaryCard label="Monthly excess" value={livePreview.sacs_excess} tone="brand" />
                <SummaryCard
                  label="Private Reserve target"
                  value={livePreview.sacs_private_reserve_target}
                  hint="6 × outflow + insurance deductibles"
                />
                <div className="my-2 h-px bg-slate-200" />
                <SummaryCard
                  label="Client 1 retirement"
                  value={livePreview.tcc_client1_retirement_total}
                />
                {client.spouse_first_name && (
                  <SummaryCard
                    label="Client 2 retirement"
                    value={livePreview.tcc_client2_retirement_total}
                  />
                )}
                <SummaryCard
                  label="Non-retirement"
                  value={livePreview.tcc_non_retirement_total}
                  hint="Joint included, trust excluded"
                />
                {trustFields.length > 0 && (
                  <SummaryCard label="Trust" value={livePreview.tcc_trust_total} />
                )}
                <SummaryCard
                  label="Grand total net worth"
                  value={livePreview.tcc_grand_total}
                  tone="brand"
                  hint="Liabilities NOT subtracted"
                />
                {liabilityFields.length > 0 && (
                  <SummaryCard
                    label="Liabilities (separate)"
                    value={livePreview.tcc_liabilities_total}
                    tone="warn"
                  />
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card space-y-3">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {empty ? <p className="text-sm text-slate-500">{empty}</p> : children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>;
}
