from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.client import Client


def list_all(db: Session) -> list[Client]:
    stmt = (
        select(Client)
        .options(
            selectinload(Client.accounts),
            selectinload(Client.liabilities),
            selectinload(Client.trust_properties),
            selectinload(Client.deductibles),
        )
        .order_by(Client.primary_last_name.asc(), Client.primary_first_name.asc())
    )
    return list(db.execute(stmt).scalars().all())


def get(db: Session, client_id: int) -> Optional[Client]:
    stmt = (
        select(Client)
        .where(Client.id == client_id)
        .options(
            selectinload(Client.accounts),
            selectinload(Client.liabilities),
            selectinload(Client.trust_properties),
            selectinload(Client.deductibles),
        )
    )
    return db.execute(stmt).scalar_one_or_none()


def save(db: Session, client: Client) -> Client:
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def delete(db: Session, client: Client) -> None:
    db.delete(client)
    db.commit()
