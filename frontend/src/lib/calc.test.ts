import { describe, expect, it } from 'vitest';
import {
  computePrivateReserveTarget,
  computeSacsExcess,
  computeTotals,
} from './calc';
import type { AccountInput, BalanceInput } from '@/types';

describe('calc — SACS', () => {
  it('computes excess = inflow - outflow', () => {
    expect(computeSacsExcess(15000, 11000)).toBe(4000);
  });

  it('handles negative excess (overspending)', () => {
    expect(computeSacsExcess(8000, 10000)).toBe(-2000);
  });

  it('PR target = 6 × outflow + sum(deductibles) by default', () => {
    expect(computePrivateReserveTarget(10500, [{ amount: 1000 }, { amount: 500 }])).toBe(64500);
  });

  it('PR target uses override when provided', () => {
    expect(
      computePrivateReserveTarget(10500, [{ amount: 1000 }], 50000),
    ).toBe(50000);
  });
});

describe('calc — TCC end-to-end matches backend transcript scenario', () => {
  const accounts: (AccountInput & { id: number })[] = [
    { id: 101, owner: 'primary', category: 'retirement', account_type: 'ira', institution: 'Schwab' },
    { id: 102, owner: 'primary', category: 'retirement', account_type: 'roth_ira', institution: 'Schwab' },
    { id: 201, owner: 'spouse', category: 'retirement', account_type: 'ira', institution: 'Schwab' },
    { id: 301, owner: 'joint', category: 'non_retirement', account_type: 'joint', institution: 'Schwab' },
  ];
  const balances: BalanceInput[] = [
    { kind: 'account', target_id: 101, field_key: 'account_101', amount: 11000 },
    { kind: 'account', target_id: 102, field_key: 'account_102', amount: 15000 },
    { kind: 'account', target_id: 201, field_key: 'account_201', amount: 22000 },
    { kind: 'account', target_id: 301, field_key: 'account_301', amount: 50000 },
    { kind: 'trust', target_id: 1, field_key: 'trust_1', amount: 450000 },
    { kind: 'liability', target_id: 1, field_key: 'liability_1', amount: 200000 },
  ];

  const totals = computeTotals({
    monthlyInflow: 15000,
    monthlyOutflow: 11000,
    privateReserveOverride: null,
    deductibles: [{ amount: 1000 }, { amount: 500 }],
    accounts,
    balances,
  });

  it('matches the transcript SACS numbers', () => {
    expect(totals.sacs_inflow).toBe(15000);
    expect(totals.sacs_outflow).toBe(11000);
    expect(totals.sacs_excess).toBe(4000);
    expect(totals.sacs_private_reserve_target).toBe(67500);
  });

  it('matches the transcript TCC totals (liabilities NOT subtracted, trust separate)', () => {
    expect(totals.tcc_client1_retirement_total).toBe(26000);
    expect(totals.tcc_client2_retirement_total).toBe(22000);
    expect(totals.tcc_non_retirement_total).toBe(50000);
    expect(totals.tcc_trust_total).toBe(450000);
    expect(totals.tcc_grand_total).toBe(548000);
    expect(totals.tcc_liabilities_total).toBe(200000);
  });
});

describe('calc — single client (no spouse)', () => {
  it('client 2 retirement total is 0 when no spouse accounts', () => {
    const totals = computeTotals({
      monthlyInflow: 8000,
      monthlyOutflow: 6000,
      privateReserveOverride: null,
      deductibles: [],
      accounts: [
        { id: 1, owner: 'primary', category: 'retirement', account_type: 'ira', institution: '' },
        { id: 2, owner: 'primary', category: 'non_retirement', account_type: 'brokerage', institution: '' },
      ],
      balances: [
        { kind: 'account', target_id: 1, field_key: 'a1', amount: 50000 },
        { kind: 'account', target_id: 2, field_key: 'a2', amount: 20000 },
      ],
    });
    expect(totals.tcc_client1_retirement_total).toBe(50000);
    expect(totals.tcc_client2_retirement_total).toBe(0);
    expect(totals.tcc_non_retirement_total).toBe(20000);
    expect(totals.tcc_grand_total).toBe(70000);
  });
});
