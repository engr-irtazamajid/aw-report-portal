from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.report import ReportBalanceKind, ReportStatus


class BalanceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: ReportBalanceKind
    target_id: Optional[int] = None
    field_key: str = Field(min_length=1, max_length=80)
    amount: float = Field(ge=0)


class ReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period_label: str = Field(min_length=1, max_length=60)
    balances: list[BalanceInput] = Field(default_factory=list)


class ReportFinalize(BaseModel):
    model_config = ConfigDict(extra="forbid")

    balances: list[BalanceInput] = Field(default_factory=list)


class ReportTotals(BaseModel):
    sacs_inflow: float
    sacs_outflow: float
    sacs_excess: float
    sacs_private_reserve_target: float

    tcc_client1_retirement_total: float
    tcc_client2_retirement_total: float
    tcc_non_retirement_total: float
    tcc_trust_total: float
    tcc_grand_total: float
    tcc_liabilities_total: float


class ReportRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: int
    client_id: int
    period_label: str
    status: ReportStatus
    generated_by_user_id: Optional[int]
    totals: ReportTotals
    balances: list[BalanceInput]
    created_at: datetime
    finalized_at: Optional[datetime]


class ReportSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: int
    period_label: str
    status: ReportStatus
    created_at: datetime
    finalized_at: Optional[datetime]


class LastBalances(BaseModel):
    report_id: Optional[int]
    period_label: Optional[str]
    by_field_key: dict[str, float] = Field(default_factory=dict)
