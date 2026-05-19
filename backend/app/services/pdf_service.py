from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import Settings
from app.core.security import decrypt_value, mask_ssn_last4
from app.models.client import Client
from app.models.report import Report, ReportBalance, ReportBalanceKind
from app.services.calculation_service import compute_totals

ReportKind = Literal["sacs", "tcc"]

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def _money(value: Decimal | float | int | None) -> str:
    if value is None:
        return "$0"
    return f"${float(value):,.0f}"


_env.filters["money"] = _money


def _balance_lookup(balances: Iterable[ReportBalance]) -> dict[str, float]:
    return {b.field_key: float(b.amount) for b in balances}


def _accounts_with_balances(
    client: Client,
    balances: Iterable[ReportBalance],
) -> dict[str, list[dict]]:
    account_amounts = {
        b.target_id: float(b.amount)
        for b in balances
        if b.kind == ReportBalanceKind.ACCOUNT and b.target_id is not None
    }
    primary_retirement: list[dict] = []
    spouse_retirement: list[dict] = []
    non_retirement: list[dict] = []

    for account in client.accounts:
        entry = {
            "id": account.id,
            "type": account.account_type.value,
            "label": account.label or account.account_type.value.replace("_", " ").title(),
            "institution": account.institution,
            "last_four": account.last_four,
            "owner": account.owner.value,
            "balance": account_amounts.get(account.id, 0.0),
        }
        if account.category.value == "retirement":
            if account.owner.value == "primary":
                primary_retirement.append(entry)
            elif account.owner.value == "spouse":
                spouse_retirement.append(entry)
            else:
                non_retirement.append(entry)
        else:
            non_retirement.append(entry)

    return {
        "primary_retirement": primary_retirement,
        "spouse_retirement": spouse_retirement,
        "non_retirement": non_retirement,
    }


def _trust_entries(client: Client, balances: Iterable[ReportBalance]) -> list[dict]:
    trust_amounts = {
        b.target_id: float(b.amount)
        for b in balances
        if b.kind == ReportBalanceKind.TRUST and b.target_id is not None
    }
    return [
        {
            "id": t.id,
            "label": t.label,
            "address": t.address,
            "balance": trust_amounts.get(t.id, 0.0),
        }
        for t in client.trust_properties
    ]


def _liability_entries(client: Client, balances: Iterable[ReportBalance]) -> list[dict]:
    liability_amounts = {
        b.target_id: float(b.amount)
        for b in balances
        if b.kind == ReportBalanceKind.LIABILITY and b.target_id is not None
    }
    return [
        {
            "id": item.id,
            "type": item.liability_type.value.replace("_", " ").title(),
            "label": item.label,
            "interest_rate": float(item.interest_rate) if item.interest_rate is not None else None,
            "last_four": item.last_four,
            "balance": liability_amounts.get(item.id, 0.0),
        }
        for item in client.liabilities
    ]


def _client_age(dob) -> int:
    today = datetime.now(UTC).date()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _render(template_name: str, context: dict) -> bytes:
    from weasyprint import HTML  # imported lazily so tests can run without it

    template = _env.get_template(template_name)
    html_text = template.render(**context)
    return HTML(string=html_text, base_url=str(_TEMPLATES_DIR)).write_pdf()


def render_sacs(client: Client, report: Report) -> bytes:
    totals = compute_totals(client, report.balances)
    lookup = _balance_lookup(report.balances)
    context = {
        "client": client,
        "report": report,
        "now": datetime.now(UTC),
        "totals": totals.to_dict(),
        "private_reserve_balance": lookup.get("private_reserve", 0.0),
        "schwab_cash_balance": lookup.get("schwab_cash", 0.0),
        "floor_amount": float(client.floor_amount),
    }
    return _render("sacs.html", context)


def render_tcc(client: Client, report: Report, settings: Settings) -> bytes:
    totals = compute_totals(client, report.balances)
    grouped = _accounts_with_balances(client, report.balances)
    primary_last4 = decrypt_value(client.primary_ssn_last4_enc, settings)
    spouse_last4 = (
        decrypt_value(client.spouse_ssn_last4_enc, settings)
        if client.spouse_ssn_last4_enc
        else ""
    )
    context = {
        "client": client,
        "report": report,
        "now": datetime.now(UTC),
        "totals": totals.to_dict(),
        "primary_retirement": grouped["primary_retirement"],
        "spouse_retirement": grouped["spouse_retirement"],
        "non_retirement": grouped["non_retirement"],
        "trust_entries": _trust_entries(client, report.balances),
        "liabilities": _liability_entries(client, report.balances),
        "primary_age": _client_age(client.primary_dob),
        "spouse_age": _client_age(client.spouse_dob) if client.spouse_dob else None,
        "primary_ssn_masked": mask_ssn_last4(primary_last4) if primary_last4 else None,
        "spouse_ssn_masked": mask_ssn_last4(spouse_last4) if spouse_last4 else None,
    }
    return _render("tcc.html", context)


def render(kind: ReportKind, client: Client, report: Report, settings: Settings) -> bytes:
    if kind == "sacs":
        return render_sacs(client, report)
    return render_tcc(client, report, settings)


def cache_path(settings: Settings, report_id: int, kind: ReportKind) -> Path:
    return settings.pdf_storage_path / f"report_{report_id}_{kind}.pdf"


def get_or_create_pdf(
    settings: Settings,
    client: Client,
    report: Report,
    kind: ReportKind,
    force: bool = False,
) -> Path:
    path = cache_path(settings, report.id, kind)
    if path.exists() and not force:
        return path
    data = render(kind, client, report, settings)
    path.write_bytes(data)
    return path
