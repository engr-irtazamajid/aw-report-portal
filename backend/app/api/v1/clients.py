
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_settings_dep, require_roles
from app.core.config import Settings
from app.core.request_utils import client_ip
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.client import ClientCreate, ClientDetail, ClientSummary, ClientUpdate
from app.schemas.report import LastBalances
from app.services import audit_service, client_service, report_service

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=list[ClientSummary])
def list_clients(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ClientSummary]:
    return client_service.list_clients_with_last_report(db)


@router.post("", response_model=ClientDetail, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.ASSISTANT)),
) -> ClientDetail:
    client = client_service.create_client(db, payload, settings)
    audit_service.record(
        db,
        action="client.create",
        actor_user_id=user.id,
        target_type="client",
        target_id=client.id,
        ip_address=client_ip(request),
    )
    return client_service.to_detail(client, settings)


@router.get("/{client_id}", response_model=ClientDetail)
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    _: User = Depends(get_current_user),
) -> ClientDetail:
    client = client_service.get_client_or_404(db, client_id)
    return client_service.to_detail(client, settings)


@router.put("/{client_id}", response_model=ClientDetail)
def update_client(
    client_id: int,
    payload: ClientUpdate,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.ASSISTANT)),
) -> ClientDetail:
    client = client_service.update_client(db, client_id, payload, settings)
    audit_service.record(
        db,
        action="client.update",
        actor_user_id=user.id,
        target_type="client",
        target_id=client.id,
        ip_address=client_ip(request),
    )
    return client_service.to_detail(client, settings)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    client_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PLANNER)),
) -> None:
    client_service.delete_client(db, client_id)
    audit_service.record(
        db,
        action="client.delete",
        actor_user_id=user.id,
        target_type="client",
        target_id=client_id,
        ip_address=client_ip(request),
    )


@router.get("/{client_id}/last-balances", response_model=LastBalances)
def get_last_balances(
    client_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> LastBalances:
    client_service.get_client_or_404(db, client_id)
    return report_service.last_balances(db, client_id)
