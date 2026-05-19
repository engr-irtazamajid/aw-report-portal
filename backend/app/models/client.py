from datetime import date
from typing import Optional

from sqlalchemy import Date, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Client(Base, TimestampMixin):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    primary_first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    primary_last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    primary_dob: Mapped[date] = mapped_column(Date, nullable=False)
    primary_ssn_last4_enc: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    spouse_first_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    spouse_last_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    spouse_dob: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    spouse_ssn_last4_enc: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    monthly_inflow: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    monthly_outflow_budget: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False, default=0
    )
    private_reserve_target_override: Mapped[Optional[float]] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    floor_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=1000)

    accounts: Mapped[list["Account"]] = relationship(  # noqa: F821
        back_populates="client", cascade="all, delete-orphan"
    )
    liabilities: Mapped[list["Liability"]] = relationship(  # noqa: F821
        back_populates="client", cascade="all, delete-orphan"
    )
    trust_properties: Mapped[list["TrustProperty"]] = relationship(  # noqa: F821
        back_populates="client", cascade="all, delete-orphan"
    )
    deductibles: Mapped[list["InsuranceDeductible"]] = relationship(  # noqa: F821
        back_populates="client", cascade="all, delete-orphan"
    )
    reports: Mapped[list["Report"]] = relationship(  # noqa: F821
        back_populates="client", cascade="all, delete-orphan"
    )
