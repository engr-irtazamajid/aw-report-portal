from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from app.models.report import Report, ReportStatus


def list_by_client(db: Session, client_id: int) -> list[Report]:
    stmt = (
        select(Report)
        .where(Report.client_id == client_id)
        .options(selectinload(Report.balances))
        .order_by(desc(Report.created_at))
    )
    return list(db.execute(stmt).scalars().all())


def get(db: Session, report_id: int) -> Optional[Report]:
    stmt = (
        select(Report)
        .where(Report.id == report_id)
        .options(selectinload(Report.balances))
    )
    return db.execute(stmt).scalar_one_or_none()


def latest_finalized_for_client(db: Session, client_id: int) -> Optional[Report]:
    stmt = (
        select(Report)
        .where(Report.client_id == client_id, Report.status == ReportStatus.FINAL)
        .options(selectinload(Report.balances))
        .order_by(desc(Report.finalized_at))
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def save(db: Session, report: Report) -> Report:
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
