from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.models.account import AccountCategory, AccountOwner, AccountType
from app.models.report import ReportBalance, ReportBalanceKind
from app.services.calculation_service import (
    compute_private_reserve_target,
    compute_sacs_excess,
    compute_tcc_non_retirement_total,
    compute_tcc_retirement_total,
    compute_totals,
)


def make_account(account_id: int, owner: AccountOwner, category: AccountCategory):
    return SimpleNamespace(
        id=account_id,
        owner=owner,
        category=category,
        account_type=AccountType.IRA,
    )


def make_balance(kind: ReportBalanceKind, amount, target_id=None, field_key=""):
    return ReportBalance(
        kind=kind, target_id=target_id, field_key=field_key, amount=amount
    )


def make_client(
    *,
    accounts=None,
    deductibles=None,
    inflow=15000,
    outflow=11000,
    override=None,
    spouse=True,
):
    deductibles = deductibles or []
    return SimpleNamespace(
        id=1,
        monthly_inflow=inflow,
        monthly_outflow_budget=outflow,
        private_reserve_target_override=override,
        accounts=accounts or [],
        deductibles=[SimpleNamespace(amount=d) for d in deductibles],
        spouse_first_name="Jane" if spouse else None,
        primary_dob=date(1980, 1, 1),
        spouse_dob=date(1982, 5, 1) if spouse else None,
        primary_first_name="John",
        primary_last_name="Doe",
    )


def test_sacs_excess_basic():
    assert compute_sacs_excess(15000, 11000) == Decimal("4000")


def test_sacs_excess_zero_when_inflow_equals_outflow():
    assert compute_sacs_excess(11000, 11000) == Decimal("0")


def test_sacs_excess_can_be_negative():
    assert compute_sacs_excess(8000, 10000) == Decimal("-2000")


def test_private_reserve_target_default_uses_6_months_plus_deductibles():
    result = compute_private_reserve_target(10500, [1000, 500])
    assert result == Decimal("64500")


def test_private_reserve_target_zero_outflow_no_deductibles():
    assert compute_private_reserve_target(0, []) == Decimal("0")


def test_private_reserve_target_override_wins():
    result = compute_private_reserve_target(10000, [500, 250], override=50000)
    assert result == Decimal("50000")


def test_retirement_total_filters_by_owner_and_category():
    accounts = [
        make_account(1, AccountOwner.PRIMARY, AccountCategory.RETIREMENT),
        make_account(2, AccountOwner.PRIMARY, AccountCategory.NON_RETIREMENT),
        make_account(3, AccountOwner.SPOUSE, AccountCategory.RETIREMENT),
    ]
    balances = {1: Decimal("11000"), 2: Decimal("50000"), 3: Decimal("15000")}
    assert compute_tcc_retirement_total(accounts, balances, AccountOwner.PRIMARY) == Decimal("11000")
    assert compute_tcc_retirement_total(accounts, balances, AccountOwner.SPOUSE) == Decimal("15000")


def test_non_retirement_total_excludes_retirement_and_trust():
    accounts = [
        make_account(1, AccountOwner.PRIMARY, AccountCategory.RETIREMENT),
        make_account(2, AccountOwner.JOINT, AccountCategory.NON_RETIREMENT),
        make_account(3, AccountOwner.PRIMARY, AccountCategory.NON_RETIREMENT),
    ]
    balances = {1: Decimal("11000"), 2: Decimal("50000"), 3: Decimal("25000")}
    assert compute_tcc_non_retirement_total(accounts, balances) == Decimal("75000")


def test_compute_totals_full_scenario_matches_transcript():
    accounts = [
        make_account(101, AccountOwner.PRIMARY, AccountCategory.RETIREMENT),
        make_account(102, AccountOwner.PRIMARY, AccountCategory.RETIREMENT),
        make_account(201, AccountOwner.SPOUSE, AccountCategory.RETIREMENT),
        make_account(301, AccountOwner.JOINT, AccountCategory.NON_RETIREMENT),
    ]
    client = make_client(accounts=accounts, deductibles=[1000, 500], inflow=15000, outflow=11000)
    balances = [
        make_balance(ReportBalanceKind.ACCOUNT, 11000, 101, "primary_ira"),
        make_balance(ReportBalanceKind.ACCOUNT, 15000, 102, "primary_roth"),
        make_balance(ReportBalanceKind.ACCOUNT, 22000, 201, "spouse_ira"),
        make_balance(ReportBalanceKind.ACCOUNT, 50000, 301, "joint_brokerage"),
        make_balance(ReportBalanceKind.TRUST, 450000, 1, "trust_home"),
        make_balance(ReportBalanceKind.LIABILITY, 200000, 1, "mortgage"),
    ]
    totals = compute_totals(client, balances)

    assert totals.sacs_inflow == Decimal("15000")
    assert totals.sacs_outflow == Decimal("11000")
    assert totals.sacs_excess == Decimal("4000")
    assert totals.sacs_private_reserve_target == Decimal("67500")

    assert totals.tcc_client1_retirement_total == Decimal("26000")
    assert totals.tcc_client2_retirement_total == Decimal("22000")
    assert totals.tcc_non_retirement_total == Decimal("50000")
    assert totals.tcc_trust_total == Decimal("450000")
    assert totals.tcc_grand_total == Decimal("548000")
    assert totals.tcc_liabilities_total == Decimal("200000")


def test_compute_totals_single_client_no_spouse():
    accounts = [
        make_account(101, AccountOwner.PRIMARY, AccountCategory.RETIREMENT),
        make_account(301, AccountOwner.PRIMARY, AccountCategory.NON_RETIREMENT),
    ]
    client = make_client(accounts=accounts, spouse=False, inflow=8000, outflow=6000, deductibles=[])
    balances = [
        make_balance(ReportBalanceKind.ACCOUNT, 50000, 101, "ira"),
        make_balance(ReportBalanceKind.ACCOUNT, 20000, 301, "brokerage"),
    ]
    totals = compute_totals(client, balances)
    assert totals.tcc_client1_retirement_total == Decimal("50000")
    assert totals.tcc_client2_retirement_total == Decimal("0")
    assert totals.tcc_non_retirement_total == Decimal("20000")
    assert totals.tcc_grand_total == Decimal("70000")
    assert totals.tcc_liabilities_total == Decimal("0")


def test_compute_totals_liabilities_are_not_subtracted():
    accounts = [make_account(1, AccountOwner.PRIMARY, AccountCategory.NON_RETIREMENT)]
    client = make_client(accounts=accounts, spouse=False)
    balances = [
        make_balance(ReportBalanceKind.ACCOUNT, 10000, 1, "savings"),
        make_balance(ReportBalanceKind.LIABILITY, 5000, 1, "credit_card"),
    ]
    totals = compute_totals(client, balances)
    assert totals.tcc_grand_total == Decimal("10000")
    assert totals.tcc_liabilities_total == Decimal("5000")


def test_compute_totals_trust_excluded_from_non_retirement():
    accounts = [make_account(1, AccountOwner.JOINT, AccountCategory.NON_RETIREMENT)]
    client = make_client(accounts=accounts, spouse=False)
    balances = [
        make_balance(ReportBalanceKind.ACCOUNT, 10000, 1, "brokerage"),
        make_balance(ReportBalanceKind.TRUST, 200000, 1, "house"),
    ]
    totals = compute_totals(client, balances)
    assert totals.tcc_non_retirement_total == Decimal("10000")
    assert totals.tcc_trust_total == Decimal("200000")
    assert totals.tcc_grand_total == Decimal("210000")
