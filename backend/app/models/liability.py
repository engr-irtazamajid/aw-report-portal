import enum
from typing import Optional

from sqlalchemy import Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class LiabilityType(str, enum.Enum):
    MORTGAGE = "mortgage"
    AUTO_LOAN = "auto_loan"
    STUDENT_LOAN = "student_loan"
    CREDIT_CARD = "credit_card"
    HELOC = "heloc"
    OTHER = "other"


class Liability(Base, TimestampMixin):
    __tablename__ = "liabilities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )

    liability_type: Mapped[LiabilityType] = mapped_column(
        Enum(LiabilityType, name="liability_type"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    interest_rate: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    last_four: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)

    client: Mapped["Client"] = relationship(back_populates="liabilities")  # noqa: F821
