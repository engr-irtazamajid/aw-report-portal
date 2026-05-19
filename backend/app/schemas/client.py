from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.account import AccountCategory, AccountOwner, AccountType
from app.models.liability import LiabilityType


class AccountBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner: AccountOwner
    category: AccountCategory
    account_type: AccountType
    institution: str = Field(default="", max_length=120)
    last_four: Optional[str] = Field(default=None, min_length=4, max_length=4)
    label: Optional[str] = Field(default=None, max_length=120)

    @field_validator("last_four")
    @classmethod
    def _validate_last_four(cls, value: Optional[str]) -> Optional[str]:
        if value is None or value == "":
            return None
        if not value.isdigit():
            raise ValueError("last_four must be 4 digits")
        return value


class AccountCreate(AccountBase):
    pass


class AccountRead(AccountBase):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: int


class LiabilityBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    liability_type: LiabilityType
    label: str = Field(min_length=1, max_length=120)
    interest_rate: Optional[float] = Field(default=None, ge=0, le=99)
    last_four: Optional[str] = Field(default=None, min_length=4, max_length=4)

    @field_validator("last_four")
    @classmethod
    def _validate_last_four(cls, value: Optional[str]) -> Optional[str]:
        if value is None or value == "":
            return None
        if not value.isdigit():
            raise ValueError("last_four must be 4 digits")
        return value


class LiabilityCreate(LiabilityBase):
    pass


class LiabilityRead(LiabilityBase):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: int


class TrustPropertyBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(default="Primary Residence", max_length=120)
    address: str = Field(min_length=1, max_length=255)
    notes: Optional[str] = Field(default=None, max_length=255)


class TrustPropertyCreate(TrustPropertyBase):
    pass


class TrustPropertyRead(TrustPropertyBase):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: int


class DeductibleBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=120)
    amount: float = Field(ge=0)


class DeductibleCreate(DeductibleBase):
    pass


class DeductibleRead(DeductibleBase):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: int


class ClientBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    primary_first_name: str = Field(min_length=1, max_length=80)
    primary_last_name: str = Field(min_length=1, max_length=80)
    primary_dob: date
    primary_ssn_last4: str = Field(min_length=4, max_length=4)

    spouse_first_name: Optional[str] = Field(default=None, max_length=80)
    spouse_last_name: Optional[str] = Field(default=None, max_length=80)
    spouse_dob: Optional[date] = None
    spouse_ssn_last4: Optional[str] = Field(default=None, min_length=4, max_length=4)

    monthly_inflow: float = Field(ge=0)
    monthly_outflow_budget: float = Field(ge=0)
    private_reserve_target_override: Optional[float] = Field(default=None, ge=0)
    floor_amount: float = Field(default=1000, ge=0)

    @field_validator("primary_ssn_last4", "spouse_ssn_last4")
    @classmethod
    def _validate_ssn(cls, value: Optional[str]) -> Optional[str]:
        if value is None or value == "":
            return None
        if not value.isdigit() or len(value) != 4:
            raise ValueError("SSN last 4 must be 4 digits")
        return value


class ClientCreate(ClientBase):
    accounts: list[AccountCreate] = Field(default_factory=list)
    liabilities: list[LiabilityCreate] = Field(default_factory=list)
    trust_properties: list[TrustPropertyCreate] = Field(default_factory=list)
    deductibles: list[DeductibleCreate] = Field(default_factory=list)


class ClientUpdate(ClientBase):
    accounts: list[AccountCreate] = Field(default_factory=list)
    liabilities: list[LiabilityCreate] = Field(default_factory=list)
    trust_properties: list[TrustPropertyCreate] = Field(default_factory=list)
    deductibles: list[DeductibleCreate] = Field(default_factory=list)


class ClientSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: int
    primary_first_name: str
    primary_last_name: str
    spouse_first_name: Optional[str]
    spouse_last_name: Optional[str]
    last_report_at: Optional[str] = None
    last_report_id: Optional[int] = None


class ClientDetail(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: int
    primary_first_name: str
    primary_last_name: str
    primary_dob: date
    primary_age: int
    primary_ssn_last4_masked: str

    spouse_first_name: Optional[str]
    spouse_last_name: Optional[str]
    spouse_dob: Optional[date]
    spouse_age: Optional[int]
    spouse_ssn_last4_masked: Optional[str]

    monthly_inflow: float
    monthly_outflow_budget: float
    private_reserve_target_override: Optional[float]
    floor_amount: float

    accounts: list[AccountRead]
    liabilities: list[LiabilityRead]
    trust_properties: list[TrustPropertyRead]
    deductibles: list[DeductibleRead]
