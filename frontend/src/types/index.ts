export type UserRole = 'admin' | 'planner' | 'assistant';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
}

export type AccountOwner = 'primary' | 'spouse' | 'joint';
export type AccountCategory = 'retirement' | 'non_retirement';
export type AccountType =
  | 'ira'
  | 'roth_ira'
  | 'k401'
  | 'pension'
  | 'brokerage'
  | 'joint'
  | 'other';

export interface AccountInput {
  owner: AccountOwner;
  category: AccountCategory;
  account_type: AccountType;
  institution: string;
  last_four?: string | null;
  label?: string | null;
}

export interface AccountRead extends AccountInput {
  id: number;
}

export type LiabilityType =
  | 'mortgage'
  | 'auto_loan'
  | 'student_loan'
  | 'credit_card'
  | 'heloc'
  | 'other';

export interface LiabilityInput {
  liability_type: LiabilityType;
  label: string;
  interest_rate?: number | null;
  last_four?: string | null;
}

export interface LiabilityRead extends LiabilityInput {
  id: number;
}

export interface TrustPropertyInput {
  label: string;
  address: string;
  notes?: string | null;
}

export interface TrustPropertyRead extends TrustPropertyInput {
  id: number;
}

export interface DeductibleInput {
  label: string;
  amount: number;
}

export interface DeductibleRead extends DeductibleInput {
  id: number;
}

export interface ClientPayload {
  primary_first_name: string;
  primary_last_name: string;
  primary_dob: string;
  primary_ssn_last4: string;
  spouse_first_name?: string | null;
  spouse_last_name?: string | null;
  spouse_dob?: string | null;
  spouse_ssn_last4?: string | null;
  monthly_inflow: number;
  monthly_outflow_budget: number;
  private_reserve_target_override?: number | null;
  floor_amount: number;
  accounts: AccountInput[];
  liabilities: LiabilityInput[];
  trust_properties: TrustPropertyInput[];
  deductibles: DeductibleInput[];
}

export interface ClientSummary {
  id: number;
  primary_first_name: string;
  primary_last_name: string;
  spouse_first_name: string | null;
  spouse_last_name: string | null;
  last_report_at: string | null;
  last_report_id: number | null;
}

export interface ClientDetail {
  id: number;
  primary_first_name: string;
  primary_last_name: string;
  primary_dob: string;
  primary_age: number;
  primary_ssn_last4_masked: string;
  spouse_first_name: string | null;
  spouse_last_name: string | null;
  spouse_dob: string | null;
  spouse_age: number | null;
  spouse_ssn_last4_masked: string | null;
  monthly_inflow: number;
  monthly_outflow_budget: number;
  private_reserve_target_override: number | null;
  floor_amount: number;
  accounts: AccountRead[];
  liabilities: LiabilityRead[];
  trust_properties: TrustPropertyRead[];
  deductibles: DeductibleRead[];
}

export type ReportBalanceKind =
  | 'account'
  | 'liability'
  | 'trust'
  | 'private_reserve'
  | 'schwab_cash';

export interface BalanceInput {
  kind: ReportBalanceKind;
  target_id?: number | null;
  field_key: string;
  amount: number;
}

export interface ReportTotals {
  sacs_inflow: number;
  sacs_outflow: number;
  sacs_excess: number;
  sacs_private_reserve_target: number;
  tcc_client1_retirement_total: number;
  tcc_client2_retirement_total: number;
  tcc_non_retirement_total: number;
  tcc_trust_total: number;
  tcc_grand_total: number;
  tcc_liabilities_total: number;
}

export interface ReportRead {
  id: number;
  client_id: number;
  period_label: string;
  status: 'draft' | 'final';
  generated_by_user_id: number | null;
  totals: ReportTotals;
  balances: BalanceInput[];
  created_at: string;
  finalized_at: string | null;
}

export interface ReportSummary {
  id: number;
  period_label: string;
  status: 'draft' | 'final';
  created_at: string;
  finalized_at: string | null;
}

export interface LastBalances {
  report_id: number | null;
  period_label: string | null;
  by_field_key: Record<string, number>;
}
