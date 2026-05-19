import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class ReportStatus(str, enum.Enum):
    DRAFT = "draft"
    FINAL = "final"


class ReportBalanceKind(str, enum.Enum):
    ACCOUNT = "account"
    LIABILITY = "liability"
    TRUST = "trust"
    PRIVATE_RESERVE = "private_reserve"
    SCHWAB_CASH = "schwab_cash"


class Report(Base, TimestampMixin):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    generated_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    period_label: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus, name="report_status"),
        nullable=False,
        default=ReportStatus.DRAFT,
    )
    totals_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    finalized_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    client: Mapped["Client"] = relationship(back_populates="reports")  # noqa: F821
    balances: Mapped[list["ReportBalance"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )


class ReportBalance(Base):
    __tablename__ = "report_balances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[ReportBalanceKind] = mapped_column(
        Enum(ReportBalanceKind, name="report_balance_kind"), nullable=False
    )
    target_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    field_key: Mapped[str] = mapped_column(String(80), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)

    report: Mapped["Report"] = relationship(back_populates="balances")
