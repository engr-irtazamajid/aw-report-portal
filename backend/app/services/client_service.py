from collections.abc import Iterable
from datetime import date

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.security import decrypt_value, encrypt_value, mask_ssn_last4
from app.models.account import Account
from app.models.client import Client
from app.models.deductible import InsuranceDeductible
from app.models.liability import Liability
from app.models.trust import TrustProperty
from app.repositories import client_repo
from app.schemas.client import (
    AccountCreate,
    AccountRead,
    ClientCreate,
    ClientDetail,
    ClientSummary,
    ClientUpdate,
    DeductibleCreate,
    DeductibleRead,
    LiabilityCreate,
    LiabilityRead,
    TrustPropertyCreate,
    TrustPropertyRead,
)


def _age(dob: date) -> int:
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _hydrate_accounts(items: Iterable[AccountCreate]) -> list[Account]:
    return [
        Account(
            owner=item.owner,
            category=item.category,
            account_type=item.account_type,
            institution=item.institution or "",
            last_four=item.last_four,
            label=item.label,
        )
        for item in items
    ]


def _hydrate_liabilities(items: Iterable[LiabilityCreate]) -> list[Liability]:
    return [
        Liability(
            liability_type=item.liability_type,
            label=item.label,
            interest_rate=item.interest_rate,
            last_four=item.last_four,
        )
        for item in items
    ]


def _hydrate_trusts(items: Iterable[TrustPropertyCreate]) -> list[TrustProperty]:
    return [
        TrustProperty(label=item.label, address=item.address, notes=item.notes)
        for item in items
    ]


def _hydrate_deductibles(items: Iterable[DeductibleCreate]) -> list[InsuranceDeductible]:
    return [InsuranceDeductible(label=item.label, amount=item.amount) for item in items]


def _validate_client_payload(payload: ClientCreate | ClientUpdate) -> None:
    has_any_spouse = any(
        v is not None
        for v in (
            payload.spouse_first_name,
            payload.spouse_last_name,
            payload.spouse_dob,
            payload.spouse_ssn_last4,
        )
    )
    if has_any_spouse:
        missing = [
            label
            for label, value in (
                ("spouse_first_name", payload.spouse_first_name),
                ("spouse_last_name", payload.spouse_last_name),
                ("spouse_dob", payload.spouse_dob),
            )
            if not value
        ]
        if missing:
            raise ValidationError(
                "If spouse is included, all required spouse fields must be set: "
                + ", ".join(missing)
            )


def create_client(db: Session, payload: ClientCreate, settings: Settings) -> Client:
    _validate_client_payload(payload)
    client = Client(
        primary_first_name=payload.primary_first_name.strip(),
        primary_last_name=payload.primary_last_name.strip(),
        primary_dob=payload.primary_dob,
        primary_ssn_last4_enc=encrypt_value(payload.primary_ssn_last4, settings),
        spouse_first_name=(payload.spouse_first_name or None),
        spouse_last_name=(payload.spouse_last_name or None),
        spouse_dob=payload.spouse_dob,
        spouse_ssn_last4_enc=(
            encrypt_value(payload.spouse_ssn_last4, settings)
            if payload.spouse_ssn_last4
            else None
        ),
        monthly_inflow=payload.monthly_inflow,
        monthly_outflow_budget=payload.monthly_outflow_budget,
        private_reserve_target_override=payload.private_reserve_target_override,
        floor_amount=payload.floor_amount,
        accounts=_hydrate_accounts(payload.accounts),
        liabilities=_hydrate_liabilities(payload.liabilities),
        trust_properties=_hydrate_trusts(payload.trust_properties),
        deductibles=_hydrate_deductibles(payload.deductibles),
    )
    return client_repo.save(db, client)


def update_client(
    db: Session,
    client_id: int,
    payload: ClientUpdate,
    settings: Settings,
) -> Client:
    _validate_client_payload(payload)
    client = client_repo.get(db, client_id)
    if not client:
        raise NotFoundError("Client not found")

    client.primary_first_name = payload.primary_first_name.strip()
    client.primary_last_name = payload.primary_last_name.strip()
    client.primary_dob = payload.primary_dob
    client.primary_ssn_last4_enc = encrypt_value(payload.primary_ssn_last4, settings)

    client.spouse_first_name = payload.spouse_first_name or None
    client.spouse_last_name = payload.spouse_last_name or None
    client.spouse_dob = payload.spouse_dob
    client.spouse_ssn_last4_enc = (
        encrypt_value(payload.spouse_ssn_last4, settings)
        if payload.spouse_ssn_last4
        else None
    )

    client.monthly_inflow = payload.monthly_inflow
    client.monthly_outflow_budget = payload.monthly_outflow_budget
    client.private_reserve_target_override = payload.private_reserve_target_override
    client.floor_amount = payload.floor_amount

    client.accounts = _hydrate_accounts(payload.accounts)
    client.liabilities = _hydrate_liabilities(payload.liabilities)
    client.trust_properties = _hydrate_trusts(payload.trust_properties)
    client.deductibles = _hydrate_deductibles(payload.deductibles)

    return client_repo.save(db, client)


def get_client_or_404(db: Session, client_id: int) -> Client:
    client = client_repo.get(db, client_id)
    if not client:
        raise NotFoundError("Client not found")
    return client


def to_detail(client: Client, settings: Settings) -> ClientDetail:
    primary_last4 = decrypt_value(client.primary_ssn_last4_enc, settings)
    spouse_last4 = decrypt_value(client.spouse_ssn_last4_enc or "", settings)
    return ClientDetail(
        id=client.id,
        primary_first_name=client.primary_first_name,
        primary_last_name=client.primary_last_name,
        primary_dob=client.primary_dob,
        primary_age=_age(client.primary_dob),
        primary_ssn_last4_masked=mask_ssn_last4(primary_last4),
        spouse_first_name=client.spouse_first_name,
        spouse_last_name=client.spouse_last_name,
        spouse_dob=client.spouse_dob,
        spouse_age=_age(client.spouse_dob) if client.spouse_dob else None,
        spouse_ssn_last4_masked=mask_ssn_last4(spouse_last4) if spouse_last4 else None,
        monthly_inflow=float(client.monthly_inflow),
        monthly_outflow_budget=float(client.monthly_outflow_budget),
        private_reserve_target_override=(
            float(client.private_reserve_target_override)
            if client.private_reserve_target_override is not None
            else None
        ),
        floor_amount=float(client.floor_amount),
        accounts=[AccountRead.model_validate(a) for a in client.accounts],
        liabilities=[LiabilityRead.model_validate(item) for item in client.liabilities],
        trust_properties=[TrustPropertyRead.model_validate(t) for t in client.trust_properties],
        deductibles=[DeductibleRead.model_validate(d) for d in client.deductibles],
    )


def to_summary(client: Client, last_report=None) -> ClientSummary:
    return ClientSummary(
        id=client.id,
        primary_first_name=client.primary_first_name,
        primary_last_name=client.primary_last_name,
        spouse_first_name=client.spouse_first_name,
        spouse_last_name=client.spouse_last_name,
        last_report_at=(
            (last_report.finalized_at or last_report.created_at).isoformat()
            if last_report
            else None
        ),
        last_report_id=last_report.id if last_report else None,
    )


def delete_client(db: Session, client_id: int) -> None:
    client = client_repo.get(db, client_id)
    if not client:
        raise NotFoundError("Client not found")
    client_repo.delete(db, client)


def list_clients_with_last_report(db: Session) -> list[ClientSummary]:
    from app.repositories import report_repo

    summaries: list[ClientSummary] = []
    for client in client_repo.list_all(db):
        last_report = report_repo.latest_finalized_for_client(db, client.id)
        summaries.append(to_summary(client, last_report))
    return summaries
