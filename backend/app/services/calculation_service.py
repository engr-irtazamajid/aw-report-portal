"""Pure calculation helpers shared by the API, PDF templates, and tests.

These rules come directly from the PRD and customer transcript:
  - SACS excess = inflow - outflow
  - SACS PR target = 6 * monthly outflow + sum(insurance deductibles), or the
    explicit override on the client profile when present.
  - TCC retirement totals are split by spouse (primary vs spouse owner).
  - TCC non-retirement total includes joint accounts but excludes trust.
  - TCC grand total = C1 retirement + C2 retirement + non-retirement + trust.
  - Liabilities are reported separately and never subtracted from net worth.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from app.models.account import Account, AccountCategory, AccountOwner
from app.models.client import Client
from app.models.report import ReportBalance, ReportBalanceKind


def _q(value: Decimal | float | int | None) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


@dataclass(frozen=True)
class ReportTotals:
    sacs_inflow: Decimal
    sacs_outflow: Decimal
    sacs_excess: Decimal
    sacs_private_reserve_target: Decimal

    tcc_client1_retirement_total: Decimal
    tcc_client2_retirement_total: Decimal
    tcc_non_retirement_total: Decimal
    tcc_trust_total: Decimal
    tcc_grand_total: Decimal
    tcc_liabilities_total: Decimal

    def to_dict(self) -> dict[str, float]:
        return {key: float(value) for key, value in self.__dict__.items()}


def compute_sacs_excess(inflow: Decimal | float, outflow: Decimal | float) -> Decimal:
    return _q(inflow) - _q(outflow)


def compute_private_reserve_target(
    monthly_outflow: Decimal | float,
    insurance_deductibles: Iterable[Decimal | float],
    months_of_expenses: int = 6,
    override: Optional[Decimal | float] = None,
) -> Decimal:
    if override is not None:
        return _q(override)
    base = _q(monthly_outflow) * Decimal(months_of_expenses)
    return base + sum((_q(d) for d in insurance_deductibles), Decimal("0"))


def _balance_for_account(
    account: Account, account_balances: dict[int, Decimal | float]
) -> Decimal:
    return _q(account_balances.get(account.id, Decimal("0")))


def compute_tcc_retirement_total(
    accounts: Iterable[Account],
    account_balances: dict[int, Decimal | float],
    owner: AccountOwner,
) -> Decimal:
    total = Decimal("0")
    for account in accounts:
        if account.category != AccountCategory.RETIREMENT:
            continue
        if account.owner != owner:
            continue
        total += _balance_for_account(account, account_balances)
    return total


def compute_tcc_non_retirement_total(
    accounts: Iterable[Account],
    account_balances: dict[int, Decimal | float],
) -> Decimal:
    total = Decimal("0")
    for account in accounts:
        if account.category != AccountCategory.NON_RETIREMENT:
            continue
        total += _balance_for_account(account, account_balances)
    return total


def compute_totals(
    client: Client,
    balances: list[ReportBalance],
) -> ReportTotals:
    account_balances: dict[int, Decimal] = {}
    trust_total = Decimal("0")
    liabilities_total = Decimal("0")

    for entry in balances:
        amount = _q(entry.amount)
        if entry.kind == ReportBalanceKind.ACCOUNT and entry.target_id is not None:
            account_balances[entry.target_id] = amount
        elif entry.kind == ReportBalanceKind.TRUST:
            trust_total += amount
        elif entry.kind == ReportBalanceKind.LIABILITY:
            liabilities_total += amount

    c1_retirement = compute_tcc_retirement_total(
        client.accounts, account_balances, AccountOwner.PRIMARY
    )
    c2_retirement = compute_tcc_retirement_total(
        client.accounts, account_balances, AccountOwner.SPOUSE
    )
    non_retirement = compute_tcc_non_retirement_total(client.accounts, account_balances)
    grand_total = c1_retirement + c2_retirement + non_retirement + trust_total

    inflow = _q(client.monthly_inflow)
    outflow = _q(client.monthly_outflow_budget)
    excess = compute_sacs_excess(inflow, outflow)
    pr_target = compute_private_reserve_target(
        outflow,
        [d.amount for d in client.deductibles],
        override=client.private_reserve_target_override,
    )

    return ReportTotals(
        sacs_inflow=inflow,
        sacs_outflow=outflow,
        sacs_excess=excess,
        sacs_private_reserve_target=pr_target,
        tcc_client1_retirement_total=c1_retirement,
        tcc_client2_retirement_total=c2_retirement,
        tcc_non_retirement_total=non_retirement,
        tcc_trust_total=trust_total,
        tcc_grand_total=grand_total,
        tcc_liabilities_total=liabilities_total,
    )
