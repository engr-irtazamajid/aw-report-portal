import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  createClient,
  deleteClient,
  getClient,
  updateClient,
} from '@/api/clients';
import { extractErrorMessage } from '@/api/client';
import { Spinner } from '@/components/ui/Spinner';
import { clientSchema, ClientFormValues } from '@/lib/validation/clientSchema';
import type { ClientPayload } from '@/types';

type Mode = 'create' | 'edit';

const ACCOUNT_TYPE_OPTIONS: { value: ClientFormValues['accounts'][number]['account_type']; label: string }[] = [
  { value: 'ira', label: 'IRA' },
  { value: 'roth_ira', label: 'Roth IRA' },
  { value: 'k401', label: '401(k)' },
  { value: 'pension', label: 'Pension' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'joint', label: 'Joint' },
  { value: 'other', label: 'Other' },
];

const LIABILITY_TYPE_OPTIONS: { value: ClientFormValues['liabilities'][number]['liability_type']; label: string }[] = [
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'auto_loan', label: 'Auto loan' },
  { value: 'student_loan', label: 'Student loan' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'heloc', label: 'HELOC' },
  { value: 'other', label: 'Other' },
];

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'financials', label: 'Static financials' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'liabilities', label: 'Liabilities' },
  { id: 'trust', label: 'Trust' },
  { id: 'deductibles', label: 'Deductibles' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const emptyDefaults: ClientFormValues = {
  primary_first_name: '',
  primary_last_name: '',
  primary_dob: '',
  primary_ssn_last4: '',
  has_spouse: false,
  spouse_first_name: undefined,
  spouse_last_name: undefined,
  spouse_dob: '',
  spouse_ssn_last4: '',
  monthly_inflow: 0,
  monthly_outflow_budget: 0,
  private_reserve_target_override: '',
  floor_amount: 1000,
  accounts: [],
  liabilities: [],
  trust_properties: [],
  deductibles: [],
};

function toPayload(values: ClientFormValues): ClientPayload {
  const override =
    values.private_reserve_target_override === '' ||
    values.private_reserve_target_override == null
      ? null
      : Number(values.private_reserve_target_override);

  return {
    primary_first_name: values.primary_first_name.trim(),
    primary_last_name: values.primary_last_name.trim(),
    primary_dob: values.primary_dob,
    primary_ssn_last4: values.primary_ssn_last4,
    spouse_first_name: values.has_spouse ? values.spouse_first_name ?? null : null,
    spouse_last_name: values.has_spouse ? values.spouse_last_name ?? null : null,
    spouse_dob: values.has_spouse && values.spouse_dob ? values.spouse_dob : null,
    spouse_ssn_last4: values.has_spouse && values.spouse_ssn_last4 ? values.spouse_ssn_last4 : null,
    monthly_inflow: Number(values.monthly_inflow),
    monthly_outflow_budget: Number(values.monthly_outflow_budget),
    private_reserve_target_override: override,
    floor_amount: Number(values.floor_amount),
    accounts: values.accounts.map(({ id: _id, ...rest }) => ({
      ...rest,
      institution: rest.institution ?? '',
      last_four: rest.last_four || null,
      label: rest.label ?? null,
    })),
    liabilities: values.liabilities.map(({ id: _id, ...rest }) => ({
      ...rest,
      interest_rate: rest.interest_rate == null || rest.interest_rate === undefined ? null : Number(rest.interest_rate),
      last_four: rest.last_four || null,
    })),
    trust_properties: values.trust_properties.map(({ id: _id, ...rest }) => ({
      ...rest,
      notes: rest.notes ?? null,
    })),
    deductibles: values.deductibles.map(({ id: _id, ...rest }) => ({
      ...rest,
      amount: Number(rest.amount),
    })),
  };
}

export function ClientFormPage({ mode }: { mode: Mode }) {
  const params = useParams();
  const clientId = params.clientId ? Number(params.clientId) : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  const detailQuery = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => getClient(clientId as number),
    enabled: mode === 'edit' && clientId != null,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: emptyDefaults,
  });

  useEffect(() => {
    if (mode !== 'edit' || !detailQuery.data) return;
    const c = detailQuery.data;
    reset({
      primary_first_name: c.primary_first_name,
      primary_last_name: c.primary_last_name,
      primary_dob: c.primary_dob,
      primary_ssn_last4: '',
      has_spouse: Boolean(c.spouse_first_name),
      spouse_first_name: c.spouse_first_name ?? undefined,
      spouse_last_name: c.spouse_last_name ?? undefined,
      spouse_dob: c.spouse_dob ?? '',
      spouse_ssn_last4: '',
      monthly_inflow: c.monthly_inflow,
      monthly_outflow_budget: c.monthly_outflow_budget,
      private_reserve_target_override:
        c.private_reserve_target_override == null ? '' : c.private_reserve_target_override,
      floor_amount: c.floor_amount,
      accounts: c.accounts.map((a) => ({
        id: a.id,
        owner: a.owner,
        category: a.category,
        account_type: a.account_type,
        institution: a.institution ?? '',
        last_four: a.last_four ?? '',
        label: a.label ?? undefined,
      })),
      liabilities: c.liabilities.map((l) => ({
        id: l.id,
        liability_type: l.liability_type,
        label: l.label,
        interest_rate: l.interest_rate ?? undefined,
        last_four: l.last_four ?? '',
      })),
      trust_properties: c.trust_properties.map((t) => ({
        id: t.id,
        label: t.label,
        address: t.address,
        notes: t.notes ?? undefined,
      })),
      deductibles: c.deductibles.map((d) => ({
        id: d.id,
        label: d.label,
        amount: d.amount,
      })),
    });
  }, [mode, detailQuery.data, reset]);

  const accountsField = useFieldArray({ control, name: 'accounts' });
  const liabilitiesField = useFieldArray({ control, name: 'liabilities' });
  const trustField = useFieldArray({ control, name: 'trust_properties' });
  const deductiblesField = useFieldArray({ control, name: 'deductibles' });

  const hasSpouse = watch('has_spouse');

  const createMut = useMutation({
    mutationFn: (payload: ClientPayload) => createClient(payload),
    onSuccess: (client) => {
      toast.success('Client created');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      navigate(`/clients/${client.id}`);
    },
    onError: (err) => toast.error(extractErrorMessage(err, 'Failed to create client')),
  });

  const updateMut = useMutation({
    mutationFn: (payload: ClientPayload) => updateClient(clientId as number, payload),
    onSuccess: (client) => {
      toast.success('Client updated');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', client.id] });
      navigate(`/clients/${client.id}`);
    },
    onError: (err) => toast.error(extractErrorMessage(err, 'Failed to update client')),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteClient(clientId as number),
    onSuccess: () => {
      toast.success('Client deleted');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      navigate('/clients');
    },
    onError: (err) => toast.error(extractErrorMessage(err, 'Failed to delete client')),
  });

  const onSubmit = handleSubmit((values) => {
    const payload = toPayload(values);
    if (mode === 'create') createMut.mutate(payload);
    else updateMut.mutate(payload);
  });

  const errorTabs = useMemo(() => {
    const tabs = new Set<TabId>();
    if (
      errors.primary_first_name ||
      errors.primary_last_name ||
      errors.primary_dob ||
      errors.primary_ssn_last4 ||
      errors.spouse_first_name ||
      errors.spouse_last_name ||
      errors.spouse_dob ||
      errors.spouse_ssn_last4
    ) {
      tabs.add('profile');
    }
    if (
      errors.monthly_inflow ||
      errors.monthly_outflow_budget ||
      errors.private_reserve_target_override ||
      errors.floor_amount
    ) {
      tabs.add('financials');
    }
    if (errors.accounts) tabs.add('accounts');
    if (errors.liabilities) tabs.add('liabilities');
    if (errors.trust_properties) tabs.add('trust');
    if (errors.deductibles) tabs.add('deductibles');
    return tabs;
  }, [errors]);

  if (mode === 'edit' && detailQuery.isLoading) {
    return (
      <div className="card flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Loading client…
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {mode === 'create' ? 'New client' : 'Edit client'}
          </h1>
          <p className="text-sm text-slate-500">
            Static info entered here pre-fills every quarterly report.
          </p>
        </div>
        <div className="flex gap-2">
          {mode === 'edit' && (
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                if (window.confirm('Delete this client and all reports? This cannot be undone.')) {
                  deleteMut.mutate();
                }
              }}
            >
              Delete
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create client' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="card p-0">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 p-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-brand-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
              {errorTabs.has(tab.id) && (
                <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-red-500" aria-label="has errors" />
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'profile' && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Primary first name" error={errors.primary_first_name?.message}>
                  <input className="input" {...register('primary_first_name')} />
                </Field>
                <Field label="Primary last name" error={errors.primary_last_name?.message}>
                  <input className="input" {...register('primary_last_name')} />
                </Field>
                <Field label="Primary DOB" error={errors.primary_dob?.message}>
                  <input type="date" className="input" {...register('primary_dob')} />
                </Field>
                <Field
                  label={mode === 'edit' ? 'Primary SSN last 4 (re-enter to save)' : 'Primary SSN last 4'}
                  error={errors.primary_ssn_last4?.message}
                >
                  <input
                    type="password"
                    autoComplete="off"
                    maxLength={4}
                    className="input"
                    {...register('primary_ssn_last4')}
                  />
                </Field>
              </div>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <Controller
                  control={control}
                  name="has_spouse"
                  render={({ field }) => (
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={field.value}
                      onChange={(e) => {
                        field.onChange(e.target.checked);
                        if (!e.target.checked) {
                          setValue('spouse_first_name', undefined);
                          setValue('spouse_last_name', undefined);
                          setValue('spouse_dob', '');
                          setValue('spouse_ssn_last4', '');
                        }
                      }}
                    />
                  )}
                />
                Married / has spouse
              </label>

              {hasSpouse && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Spouse first name" error={errors.spouse_first_name?.message}>
                    <input className="input" {...register('spouse_first_name')} />
                  </Field>
                  <Field label="Spouse last name" error={errors.spouse_last_name?.message}>
                    <input className="input" {...register('spouse_last_name')} />
                  </Field>
                  <Field label="Spouse DOB" error={errors.spouse_dob?.message}>
                    <input type="date" className="input" {...register('spouse_dob')} />
                  </Field>
                  <Field label="Spouse SSN last 4" error={errors.spouse_ssn_last4?.message}>
                    <input
                      type="password"
                      autoComplete="off"
                      maxLength={4}
                      className="input"
                      {...register('spouse_ssn_last4')}
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          {activeTab === 'financials' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Monthly inflow (after tax)"
                error={errors.monthly_inflow?.message}
                hint="Take-home pay deposited into primary checking each month."
              >
                <input type="number" min={0} step="100" className="input" {...register('monthly_inflow')} />
              </Field>
              <Field
                label="Monthly outflow budget"
                error={errors.monthly_outflow_budget?.message}
                hint="Agreed expense budget that gets transferred to spending."
              >
                <input
                  type="number"
                  min={0}
                  step="100"
                  className="input"
                  {...register('monthly_outflow_budget')}
                />
              </Field>
              <Field
                label="Private Reserve target override (optional)"
                error={errors.private_reserve_target_override?.message as string}
                hint="Leave blank to auto-calculate: 6 × outflow + insurance deductibles."
              >
                <input type="number" min={0} step="100" className="input" {...register('private_reserve_target_override')} />
              </Field>
              <Field label="Floor amount per account" error={errors.floor_amount?.message}>
                <input type="number" min={0} step="50" className="input" {...register('floor_amount')} />
              </Field>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Add every Schwab, brokerage, IRA, Roth, 401(k), and joint account the household holds.
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    accountsField.append({
                      owner: 'primary',
                      category: 'retirement',
                      account_type: 'ira',
                      institution: 'Charles Schwab',
                      last_four: '',
                      label: undefined,
                    })
                  }
                >
                  Add account
                </button>
              </div>

              {accountsField.fields.length === 0 ? (
                <EmptyHint label="No accounts yet." />
              ) : (
                accountsField.fields.map((field, idx) => (
                  <div key={field.id} className="grid gap-3 rounded-md border border-slate-200 p-4 sm:grid-cols-6">
                    <Field label="Owner">
                      <select className="input" {...register(`accounts.${idx}.owner` as const)}>
                        <option value="primary">Primary</option>
                        <option value="spouse">Spouse</option>
                        <option value="joint">Joint</option>
                      </select>
                    </Field>
                    <Field label="Category">
                      <select className="input" {...register(`accounts.${idx}.category` as const)}>
                        <option value="retirement">Retirement</option>
                        <option value="non_retirement">Non-retirement</option>
                      </select>
                    </Field>
                    <Field label="Type">
                      <select className="input" {...register(`accounts.${idx}.account_type` as const)}>
                        {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Institution">
                      <input className="input" {...register(`accounts.${idx}.institution` as const)} />
                    </Field>
                    <Field
                      label="Last 4"
                      error={errors.accounts?.[idx]?.last_four?.message as string | undefined}
                    >
                      <input className="input" maxLength={4} {...register(`accounts.${idx}.last_four` as const)} />
                    </Field>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="btn-secondary w-full"
                        onClick={() => accountsField.remove(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'liabilities' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Liabilities are tracked separately and are <strong>not</strong> subtracted from net worth.
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    liabilitiesField.append({
                      liability_type: 'mortgage',
                      label: 'Mortgage',
                      interest_rate: undefined,
                      last_four: '',
                    })
                  }
                >
                  Add liability
                </button>
              </div>
              {liabilitiesField.fields.length === 0 ? (
                <EmptyHint label="No liabilities recorded." />
              ) : (
                liabilitiesField.fields.map((field, idx) => (
                  <div key={field.id} className="grid gap-3 rounded-md border border-slate-200 p-4 sm:grid-cols-5">
                    <Field label="Type">
                      <select className="input" {...register(`liabilities.${idx}.liability_type` as const)}>
                        {LIABILITY_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label="Label"
                      error={errors.liabilities?.[idx]?.label?.message as string | undefined}
                    >
                      <input className="input" {...register(`liabilities.${idx}.label` as const)} />
                    </Field>
                    <Field
                      label="Rate %"
                      error={errors.liabilities?.[idx]?.interest_rate?.message as string | undefined}
                    >
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        className="input"
                        {...register(`liabilities.${idx}.interest_rate` as const)}
                      />
                    </Field>
                    <Field label="Last 4">
                      <input className="input" maxLength={4} {...register(`liabilities.${idx}.last_four` as const)} />
                    </Field>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="btn-secondary w-full"
                        onClick={() => liabilitiesField.remove(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'trust' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Trust properties are quoted using Zillow Zestimate during quarterly entry.
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    trustField.append({ label: 'Primary Residence', address: '', notes: undefined })
                  }
                >
                  Add property
                </button>
              </div>
              {trustField.fields.length === 0 ? (
                <EmptyHint label="No trust properties." />
              ) : (
                trustField.fields.map((field, idx) => (
                  <div key={field.id} className="grid gap-3 rounded-md border border-slate-200 p-4 sm:grid-cols-5">
                    <Field
                      label="Label"
                      error={errors.trust_properties?.[idx]?.label?.message as string | undefined}
                    >
                      <input className="input" {...register(`trust_properties.${idx}.label` as const)} />
                    </Field>
                    <div className="sm:col-span-3">
                      <Field
                        label="Address"
                        error={errors.trust_properties?.[idx]?.address?.message as string | undefined}
                      >
                        <input className="input" {...register(`trust_properties.${idx}.address` as const)} />
                      </Field>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="btn-secondary w-full"
                        onClick={() => trustField.remove(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'deductibles' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Insurance deductibles roll into the Private Reserve target calculation.
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => deductiblesField.append({ label: 'Auto', amount: 0 })}
                >
                  Add deductible
                </button>
              </div>
              {deductiblesField.fields.length === 0 ? (
                <EmptyHint label="No insurance deductibles." />
              ) : (
                deductiblesField.fields.map((field, idx) => (
                  <div key={field.id} className="grid gap-3 rounded-md border border-slate-200 p-4 sm:grid-cols-4">
                    <Field
                      label="Label"
                      error={errors.deductibles?.[idx]?.label?.message as string | undefined}
                    >
                      <input className="input" {...register(`deductibles.${idx}.label` as const)} />
                    </Field>
                    <Field
                      label="Amount"
                      error={errors.deductibles?.[idx]?.amount?.message as string | undefined}
                    >
                      <input
                        type="number"
                        step="100"
                        min={0}
                        className="input"
                        {...register(`deductibles.${idx}.amount` as const)}
                      />
                    </Field>
                    <div className="sm:col-span-2 flex items-end">
                      <button
                        type="button"
                        className="btn-secondary w-full"
                        onClick={() => deductiblesField.remove(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}
