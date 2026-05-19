from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User, UserRole
from app.repositories import user_repo


def authenticate(db: Session, email: str, password: str) -> User:
    user = user_repo.get_by_email(db, email)
    if not user or not user.is_active:
        raise UnauthorizedError("Invalid credentials")
    if not verify_password(password, user.password_hash):
        raise UnauthorizedError("Invalid credentials")
    return user


def issue_tokens(user: User, settings: Settings) -> tuple[str, str]:
    access = create_access_token(str(user.id), user.role.value, settings)
    refresh = create_refresh_token(str(user.id), settings)
    return access, refresh


def refresh_access_token(
    db: Session, refresh_token: str, settings: Settings
) -> tuple[User, str]:
    try:
        payload = decode_token(refresh_token, settings)
    except ValueError as exc:
        raise UnauthorizedError("Invalid refresh token") from exc
    if payload.get("type") != "refresh":
        raise UnauthorizedError("Invalid refresh token")
    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Invalid refresh token")
    user = user_repo.get_by_id(db, int(user_id))
    if not user or not user.is_active:
        raise UnauthorizedError("Account disabled")
    access = create_access_token(str(user.id), user.role.value, settings)
    return user, access


def create_user(
    db: Session,
    email: str,
    password: str,
    role: UserRole,
    full_name: str = "",
) -> User:
    user = User(
        email=email.lower(),
        password_hash=hash_password(password),
        role=role,
        full_name=full_name,
    )
    return user_repo.create(db, user)


def ensure_seed_admin(db: Session, settings: Settings) -> Optional[User]:
    existing = user_repo.get_by_email(db, settings.seed_admin_email)
    if existing:
        return existing
    return create_user(
        db,
        email=settings.seed_admin_email,
        password=settings.seed_admin_password,
        role=UserRole.ADMIN,
        full_name="Portal Admin",
    )
