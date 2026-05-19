from typing import Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class TrustProperty(Base, TimestampMixin):
    __tablename__ = "trust_properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )

    label: Mapped[str] = mapped_column(String(120), nullable=False, default="Primary Residence")
    address: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    client: Mapped["Client"] = relationship(back_populates="trust_properties")  # noqa: F821
