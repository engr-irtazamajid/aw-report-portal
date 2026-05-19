from datetime import UTC, datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models.client import Client
from app.models.report import Report, ReportBalance, ReportStatus
from app.repositories import report_repo
from app.schemas.report import (
    BalanceInput,
    LastBalances,
    ReportRead,
    ReportSummary,
)
from app.schemas.report import (
    ReportTotals as ReportTotalsSchema,
)
from app.services.calculation_service import compute_totals


def _balances_to_entities(
    report_id: Optional[int], items: list[BalanceInput]
) -> list[ReportBalance]:
    return [
        ReportBalance(
            report_id=report_id,
            kind=item.kind,
            target_id=item.target_id,
            field_key=item.field_key,
            amount=item.amount,
        )
        for item in items
    ]


def create_draft(
    db: Session,
    client: Client,
    period_label: str,
    balances: list[BalanceInput],
    user_id: Optional[int],
) -> Report:
    report = Report(
        client_id=client.id,
        period_label=period_label.strip(),
        status=ReportStatus.DRAFT,
        generated_by_user_id=user_id,
    )
    report.balances = _balances_to_entities(None, balances)
    totals = compute_totals(client, report.balances)
    report.totals_json = totals.to_dict()
    return report_repo.save(db, report)


def finalize(
    db: Session,
    report: Report,
    client: Client,
    balances: list[BalanceInput],
) -> Report:
    if report.status == ReportStatus.FINAL:
        raise ConflictError("Report is already finalized")

    report.balances = _balances_to_entities(report.id, balances)
    totals = compute_totals(client, report.balances)
    report.totals_json = totals.to_dict()
    report.status = ReportStatus.FINAL
    report.finalized_at = datetime.now(UTC)
    return report_repo.save(db, report)


def get_or_404(db: Session, report_id: int) -> Report:
    report = report_repo.get(db, report_id)
    if not report:
        raise NotFoundError("Report not found")
    return report


def list_for_client(db: Session, client_id: int) -> list[ReportSummary]:
    return [to_summary(r) for r in report_repo.list_by_client(db, client_id)]


def to_read(report: Report) -> ReportRead:
    totals = report.totals_json or {}
    return ReportRead(
        id=report.id,
        client_id=report.client_id,
        period_label=report.period_label,
        status=report.status,
        generated_by_user_id=report.generated_by_user_id,
        totals=ReportTotalsSchema(
            sacs_inflow=totals.get("sacs_inflow", 0),
            sacs_outflow=totals.get("sacs_outflow", 0),
            sacs_excess=totals.get("sacs_excess", 0),
            sacs_private_reserve_target=totals.get("sacs_private_reserve_target", 0),
            tcc_client1_retirement_total=totals.get("tcc_client1_retirement_total", 0),
            tcc_client2_retirement_total=totals.get("tcc_client2_retirement_total", 0),
            tcc_non_retirement_total=totals.get("tcc_non_retirement_total", 0),
            tcc_trust_total=totals.get("tcc_trust_total", 0),
            tcc_grand_total=totals.get("tcc_grand_total", 0),
            tcc_liabilities_total=totals.get("tcc_liabilities_total", 0),
        ),
        balances=[
            BalanceInput(
                kind=b.kind,
                target_id=b.target_id,
                field_key=b.field_key,
                amount=float(b.amount),
            )
            for b in report.balances
        ],
        created_at=report.created_at,
        finalized_at=report.finalized_at,
    )


def to_summary(report: Report) -> ReportSummary:
    return ReportSummary(
        id=report.id,
        period_label=report.period_label,
        status=report.status,
        created_at=report.created_at,
        finalized_at=report.finalized_at,
    )


def last_balances(db: Session, client_id: int) -> LastBalances:
    last = report_repo.latest_finalized_for_client(db, client_id)
    if not last:
        return LastBalances(report_id=None, period_label=None, by_field_key={})
    return LastBalances(
        report_id=last.id,
        period_label=last.period_label,
        by_field_key={b.field_key: float(b.amount) for b in last.balances},
    )
