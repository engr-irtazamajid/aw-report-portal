import type {
  AccountInput,
  BalanceInput,
  DeductibleInput,
  ReportTotals,
} from '@/types';

export interface CalcInput {
  monthlyInflow: number;
  monthlyOutflow: number;
  privateReserveOverride: number | null;
  deductibles: Pick<DeductibleInput, 'amount'>[];
  accounts: (AccountInput & { id?: number })[];
  balances: BalanceInput[];
}

export function computeSacsExcess(inflow: number, outflow: number): number {
  return Number((inflow - outflow).toFixed(2));
}

export function computePrivateReserveTarget(
  monthlyOutflow: number,
  deductibles: Pick<DeductibleInput, 'amount'>[],
  override?: number | null,
): number {
  if (override != null) return Number(override);
  const base = monthlyOutflow * 6;
  const deductibleSum = deductibles.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  return Number((base + deductibleSum).toFixed(2));
}

export function computeTotals(input: CalcInput): ReportTotals {
  const accountBalances = new Map<number, number>();
  let trustTotal = 0;
  let liabilitiesTotal = 0;

  for (const b of input.balances) {
    const amount = Number(b.amount) || 0;
    if (b.kind === 'account' && b.target_id != null) {
      accountBalances.set(b.target_id, amount);
    } else if (b.kind === 'trust') {
      trustTotal += amount;
    } else if (b.kind === 'liability') {
      liabilitiesTotal += amount;
    }
  }

  let c1Retirement = 0;
  let c2Retirement = 0;
  let nonRetirement = 0;

  for (const acc of input.accounts) {
    const id = (acc as { id?: number }).id;
    if (id == null) continue;
    const amount = accountBalances.get(id) ?? 0;
    if (acc.category === 'retirement') {
      if (acc.owner === 'primary') c1Retirement += amount;
      else if (acc.owner === 'spouse') c2Retirement += amount;
      else nonRetirement += amount;
    } else {
      nonRetirement += amount;
    }
  }

  const inflow = Number(input.monthlyInflow) || 0;
  const outflow = Number(input.monthlyOutflow) || 0;
  const excess = computeSacsExcess(inflow, outflow);
  const prTarget = computePrivateReserveTarget(
    outflow,
    input.deductibles,
    input.privateReserveOverride,
  );

  return {
    sacs_inflow: inflow,
    sacs_outflow: outflow,
    sacs_excess: excess,
    sacs_private_reserve_target: prTarget,
    tcc_client1_retirement_total: round2(c1Retirement),
    tcc_client2_retirement_total: round2(c2Retirement),
    tcc_non_retirement_total: round2(nonRetirement),
    tcc_trust_total: round2(trustTotal),
    tcc_grand_total: round2(c1Retirement + c2Retirement + nonRetirement + trustTotal),
    tcc_liabilities_total: round2(liabilitiesTotal),
  };
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
