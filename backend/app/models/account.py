import enum
from typing import Optional

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class AccountOwner(str, enum.Enum):
    PRIMARY = "primary"
    SPOUSE = "spouse"
    JOINT = "joint"


class AccountCategory(str, enum.Enum):
    RETIREMENT = "retirement"
    NON_RETIREMENT = "non_retirement"


class AccountType(str, enum.Enum):
    IRA = "ira"
    ROTH_IRA = "roth_ira"
    K401 = "k401"
    PENSION = "pension"
    BROKERAGE = "brokerage"
    JOINT = "joint"
    OTHER = "other"


class Account(Base, TimestampMixin):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )

    owner: Mapped[AccountOwner] = mapped_column(
        Enum(AccountOwner, name="account_owner"), nullable=False
    )
    category: Mapped[AccountCategory] = mapped_column(
        Enum(AccountCategory, name="account_category"), nullable=False
    )
    account_type: Mapped[AccountType] = mapped_column(
        Enum(AccountType, name="account_type"), nullable=False
    )
    institution: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    last_four: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    label: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    client: Mapped["Client"] = relationship(back_populates="accounts")  # noqa: F821
